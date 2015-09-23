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
module Tools {
  import Thread = Profiler.Thread;
  import TimelineFrame = Profiler.TimelineFrame;
  import TimelineBuffer = Profiler.TimelineBuffer;
  import TimelineBufferSnapshot = Profiler.TimelineBufferSnapshot;
  import TimelineItemKind = Profiler.TimelineItemKind;
  import TimelineFrameStatistics = Profiler.TimelineFrameStatistics;

  interface KindStyle {
    bgColor: string;
    textColor: string;
  }

  export enum FlameChartDragTarget {
    NONE,
    WINDOW,
    HANDLE_LEFT,
    HANDLE_RIGHT,
    HANDLE_BOTH
  }

  export interface FlameChartDragInfo {
    offsetYInitial: number;
    windowStartInitial: number;
    windowEndInitial: number;
    target: FlameChartDragTarget;
  }

  export class FlameChart extends TimelineChart implements MouseControllerTarget {

    private _snapshot: TimelineBufferSnapshot;

    private _kindStyle: any;

    private _offsetY: number = 0;

    private _maxDepth: number;
    private _hoveredFrame:TimelineFrame;
    private _initialized: boolean = false;
    private _dragInfo: FlameChartDragInfo;

    /**
     * Don't paint frames whose width is smaller than this value. This helps a lot when drawing
     * large ranges. This can be < 1 since anti-aliasing can look quite nice.
     */
    private _minFrameWidthInPixels = 1;

    public setMinFrameWidthInPixels(width: number) {
      this._minFrameWidthInPixels = width;
      this._invalidate();
    };

    constructor(container: HTMLDivElement, timelineController: TimelineController) {
      super(container, timelineController);
      this._allowZooming = true;
    }

    setSampleData(thread: Thread) {
      var buffer = Tools.Profiler.TimelineBuffer.FromFirefoxProfile(thread.file.json);
      this._snapshot = buffer.createSnapshot();
      this._maxDepth = this._snapshot.maxDepth;
      this._kindStyle = Object.create(null);
      this.setRangeAndWindow(thread.startTime, thread.endTime);
      this._invalidate();
    }

    setMarkerData(thread: Thread) {
      var buffer = Tools.Profiler.TimelineBuffer.FromFirefoxThreadMarkers(thread);
      this._snapshot = buffer.createSnapshot();
      this._maxDepth = this._snapshot.maxDepth;
      this._kindStyle = Object.create(null);
      this.setRangeAndWindow(thread.startTime, thread.endTime);
      this._invalidate();
    }

    setSize(width: number, height?: number) {
      super.setSize(width, height || (this._initialized ? this.contentHeight : 100));
    }

    get contentHeight() {
      return this._maxDepth * 14.5;
    }

    render() {
      if (!this._dirty || !this._snapshot) return;
      var context = this._context;
      ColorStyle.reset();
      this._clearCanvas();
      context.save();
      this._drawChildren(this._snapshot);
      this._drawTime();
      context.restore();
      this._dirty = false;
    }

    private _drawChildren(parent: TimelineFrame, depth: number = 0) {
      var range = parent.getChildRange(this._windowStartTime, this._windowEndTime);
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
      var left = this._timeToPixel(frame.startTime) | 0;
      var right = this._timeToPixel(frame.endTime) | 0;
      var width = right - left;
      if (width <= this._minFrameWidthInPixels) {
        context.fillStyle = theme.timeMarker(1);
        context.fillRect(left, depth * (frameHeight + frameVPadding), this._minFrameWidthInPixels, 12 + (frame.maxDepth - frame.depth) * frameHeight);
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
          bgColor: theme.blueGreyHighlight(1),
          textColor: theme.bodyText(1) // ColorStyle.contrastStyle(background)
        };
      }
      context.save();
      context.translate(0, this._offsetY);
      //if (this._hoveredFrame && this._hoveredFrame.kind !== frame.kind) {
      //  context.globalAlpha = 0.4;
      //}
      // context.fillStyle = style.bgColor;
      context.fillStyle = theme.blueHighlight(depth % 2 ? 0.2 : 0.1);
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

    private _getFrameAtPosition(x: number, y: number): TimelineFrame {
      var time = this._pixelToTime(x);
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
      this._mouseController.updateCursor(MouseCursor.ALL_SCROLL);
      this._dragInfo = <FlameChartDragInfo>{
        offsetYInitial: this._offsetY,
        windowStartInitial: this._windowStartTime,
        windowEndInitial: this._windowEndTime,
        target: FlameChartDragTarget.WINDOW
      };
    }

    onMouseMove(x: number, y: number) {
      var t = this._pixelToTime(x);
      this._controller.onTimeChanged(this, t);
      this.setTime(t);
    }
    onMouseOver(x: number, y: number) {}
    onMouseOut() {}

    _pixelToTimeRelative(x: number): number {
      var range = this._windowEndTime - this._windowStartTime; // REDUX??
      return x * range / this._width;
    }

    onDrag(startX: number, startY: number, currentX: number, currentY: number, deltaX: number, deltaY: number) {
      var dragInfo = this._dragInfo;
      if (dragInfo) {
        var delta = this._pixelToTimeRelative(-deltaX);
        var windowStart = dragInfo.windowStartInitial + delta;
        var windowEnd = dragInfo.windowEndInitial + delta;
        this._controller.onWindowChanged(this, windowStart, windowEnd);
        this._offsetY = clamp(dragInfo.offsetYInitial + deltaY, -this.contentHeight - this._height, 0);
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
        // this._controller.showTooltip(this, frame, x, y);
        //this._draw();
      }
    }

    onHoverEnd() {
      if (this._hoveredFrame) {
        this._hoveredFrame = null;
        // this._controller.hideTooltip();
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
