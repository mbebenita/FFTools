/**
 * Copyright 2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
module Tools.Profiler {

  import clamp = NumberUtilities.clamp;
  import trimMiddle = StringUtilities.trimMiddle;

  interface KindStyle {
    bgColor: string;
    textColor: string;
  }

  export class FlameChart extends ChartBase implements MouseControllerTarget {

    private _snapshot: TimelineBufferSnapshot;

    private _kindStyle: Map<KindStyle>;
    private _textWidth = {};

    private _offsetY: number = 0;

    private _maxDepth: number;
    private _hoveredFrame:TimelineFrame;

    /**
     * Don't paint frames whose width is smaller than this value. This helps a lot when drawing
     * large ranges. This can be < 1 since anti-aliasing can look quite nice.
     */
    private _minFrameWidthInPixels = 1;

    constructor(controller: Controller, snapshot: TimelineBufferSnapshot) {
      super(controller);
      this._snapshot = snapshot;
      this._kindStyle = Object.create(null);
    }

    setSize(width: number, height?: number) {
      super.setSize(width, height || (this._initialized ? this.contentHeight : 100));
    }

    get contentHeight() {
      return this._maxDepth * 14.5;
    }

    initialize(rangeStart: number, rangeEnd: number, height: number = 256) {
      this._initialized = true;
      this._maxDepth = this._snapshot.maxDepth;
      this.setRange(rangeStart, rangeEnd, false);
      this.setWindow(rangeStart, rangeEnd, false);
      this.setSize(this._width, height);
    }

    destroy() {
      super.destroy();
      this._snapshot = null;
    }

    draw() {
      var context = this._context;
      var ratio = window.devicePixelRatio;

      ColorStyle.reset();

      context.save();
      context.scale(ratio, ratio);
      context.fillStyle = this._controller.theme.bodyBackground(1);
      context.fillRect(0, 0, this._width, this._height);

      if (this._initialized) {
        this._drawChildren(this._snapshot);
      }

      context.restore();
    }

    private _drawChildren(parent: TimelineFrame, depth: number = 0) {
      var range = parent.getChildRange(this._windowStart, this._windowEnd);
      if (range) {
        for (var i = range.startIndex; i <= range.endIndex; i++) {
          var child = parent.children[i];
          if (this._drawFrame(child, depth)) {
            this._drawChildren(child, depth + 1);
          }
        }
      }
    }

    private _drawFrame(frame: TimelineFrame, depth: number): boolean {
      var context = this._context;
      var frameVPadding = 1;
      var frameHeight = 16;
      var left = this._toPixels(frame.startTime) | 0;
      var right = this._toPixels(frame.endTime) | 0;
      var width = right - left;
      if (width <= this._minFrameWidthInPixels) {
        // context.fillStyle = this._controller.theme.tabToolbar(1);
        // context.fillRect(left, depth * (frameHeight + frameVPadding), this._minFrameWidthInPixels, 12 + (frame.maxDepth - frame.depth) * frameHeight);
        return false;
      }
      if (left < 0) {
        right = width + left;
        left = 0;
      }
      var adjustedWidth = right - left;
      var style = this._kindStyle[frame.kind.id];
      if (!style) {
        var background = ColorStyle.randomStyle();
        style = this._kindStyle[frame.kind.id] = {
          bgColor: this._controller.theme.blueGreyHighlight(1),
          textColor: this._controller.theme.bodyText(1) // ColorStyle.contrastStyle(background)
        };
      }
      context.save();
      context.translate(0, this._offsetY);
      //if (this._hoveredFrame && this._hoveredFrame.kind !== frame.kind) {
      //  context.globalAlpha = 0.4;
      //}
      // context.fillStyle = style.bgColor;
      context.fillStyle = this._controller.theme.blueHighlight(depth % 2 ? 0.2 : 0.1);
      context.fillRect(left, depth * (frameHeight + frameVPadding), adjustedWidth - 1, frameHeight);
      context.font = '10px Input Mono Condensed';
      if (width > 12) {
        var label = frame.kind.name;
        if (label && label.length) {
          var labelHPadding = 2;
          label = this._prepareText(context, label, adjustedWidth - labelHPadding * 2);
          if (label.length) {
            context.fillStyle = style.textColor;
            context.textBaseline = "middle";
            context.fillText(label, left + labelHPadding, (depth + 1) * (frameHeight + frameVPadding) - frameHeight / 2);
          }
        }
      }
      context.restore();
      return true;
    }

    private _prepareText(context: CanvasRenderingContext2D, title: string, maxSize: number):string {
      var titleWidth = this._measureWidth(context, title);
      if (maxSize > titleWidth) {
        return title;
      }
      var l = 3;
      var r = title.length;
      while (l < r) {
        var m = (l + r) >> 1;
        if (this._measureWidth(context, trimMiddle(title, m)) < maxSize) {
          l = m + 1;
        } else {
          r = m;
        }
      }
      title = trimMiddle(title, r - 1);
      titleWidth = this._measureWidth(context, title);
      if (titleWidth <= maxSize) {
        return title;
      }
      return "";
    }

    private _measureWidth(context: CanvasRenderingContext2D, text: string): number {
      var width = this._textWidth[text];
      if (!width) {
        width = context.measureText(text).width;
        this._textWidth[text] = width;
      }
      return width;
    }

    private _getFrameAtPosition(x: number, y: number): TimelineFrame {
      var time = this._toTime(x);
      var depth = 1 + (y / 12.5) | 0;
      var frame = this._snapshot.query(time);
      if (frame && frame.depth >= depth) {
        while (frame && frame.depth > depth) {
          frame = frame.parent;
        }
        return frame;
      }
      return null;
    }

    onMouseDown(x: number, y: number) {
      if (!this._windowEqRange()) {
        this._mouseController.updateCursor(MouseCursor.ALL_SCROLL);
        this._dragInfo = <FlameChartDragInfo>{
          offsetYInitial: this._offsetY,
          windowStartInitial: this._windowStart,
          windowEndInitial: this._windowEnd,
          target: FlameChartDragTarget.WINDOW
        };
      }
    }

    onMouseMove(x: number, y: number) {}
    onMouseOver(x: number, y: number) {}
    onMouseOut() {}

    onDrag(startX: number, startY: number, currentX: number, currentY: number, deltaX: number, deltaY: number) {
      var dragInfo = this._dragInfo;
      if (dragInfo) {
        var delta = this._toTimeRelative(-deltaX);
        var windowStart = dragInfo.windowStartInitial + delta;
        var windowEnd = dragInfo.windowEndInitial + delta;
        this._controller.setWindow(windowStart, windowEnd);
        this._offsetY = clamp(dragInfo.offsetYInitial + deltaY, -this.contentHeight - this._height, 0);
        // console.info(startY + " " + currentY + " " + this._offsetY);
      }
    }

    onDragEnd(startX: number, startY: number, currentX: number, currentY: number, deltaX: number, deltaY: number) {
      this._dragInfo = null;
      this._mouseController.updateCursor(MouseCursor.DEFAULT);
    }

    onClick(x: number, y: number) {
      this._dragInfo = null;
      this._mouseController.updateCursor(MouseCursor.DEFAULT);
    }

    onHoverStart(x: number, y: number) {
      var frame = this._getFrameAtPosition(x, y);
      if (frame) {
        this._hoveredFrame = frame;
        this._controller.showTooltip(this, frame, x, y);
        //this._draw();
      }
    }

    onHoverEnd() {
      if (this._hoveredFrame) {
        this._hoveredFrame = null;
        this._controller.hideTooltip();
        //this._draw();
      }
    }

    getStatistics(kind: TimelineItemKind): TimelineFrameStatistics {
      var snapshot = this._snapshot;
      if (!snapshot.statistics) {
        snapshot.calculateStatistics();
      }
      return snapshot.statistics[kind.id];
    }
  }
}
