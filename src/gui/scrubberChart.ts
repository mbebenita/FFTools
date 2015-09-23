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
  export enum ScrubberChartType {
    OVERVIEW,
    CHART
  }

  export enum ScrubberChartDragTarget {
    NONE,
    WINDOW,
    HANDLE_LEFT,
    HANDLE_RIGHT,
    HANDLE_BOTH
  }

  export interface ScrubberDragInfo {
    offsetYInitial: number;
    windowStartTimeInitial: number;
    windowEndTimeInitial: number;
    target: ScrubberChartDragTarget;
  }
  
  export class ScrubberChart extends TimelineChart  {

    private _type: ScrubberChartType;
    private _dragInfo: ScrubberDragInfo;
    private _thread: Thread;

    private static TICK_MAX_WIDTH = 75;
    private static DRAGHANDLE_WIDTH = 4;

    constructor(container: HTMLDivElement, timelineController: TimelineController, type: ScrubberChartType = ScrubberChartType.OVERVIEW) {
      super(container, timelineController);
      this._type = type;
      this._windowStartTime = 0;
      this._windowEndTime = 1;
      this._allowZooming = true;
    }

    setData(thread: Thread) {
      this._thread = thread;
      this._windowStartTime = this._startTime = thread.startTime;
      this._windowEndTime = this._endTime = thread.endTime;
      this._invalidate();
    }

    render() {
      if (!this._dirty || !this._thread) return;
      if (this._type == ScrubberChartType.OVERVIEW) {
        var left = this._timeToPixel(this._windowStartTime);
        var right = this._timeToPixel(this._windowEndTime);
        this._clearCanvas();
        this._drawLabels(this._startTime, this._endTime);
        this._drawHiddenArea(0, left);
        this._drawHiddenArea(right, this._width);
        this._drawTime();
        this._drawDragHandle(left);
        this._drawDragHandle(right);
      } else {
        this._drawLabels(this._windowStartTime, this._windowEndTime);
      }
      this._dirty = false;
    }

    private _drawHiddenArea(a: number, b: number) {
      var context = this._context;
      context.fillStyle = theme.contentTextDarkGrey(0.3);
      context.fillRect(a, 0, b - a, this._height);
    }

    private _drawLabels(startTime: number, endTime: number) {
      var context = this._context;
      var tickInterval = this._calculateTickInterval(startTime, endTime);
      var tick = Math.ceil(startTime / tickInterval) * tickInterval;
      var showSeconds = (tickInterval >= 500);
      var divisor = showSeconds ? 1000 : 1;
      var precision = this._decimalPlaces(tickInterval / divisor);
      var unit = showSeconds ? "s" : "ms";
      var x = this._timeToPixel(tick);
      var y = this._height / 2;
      context.lineWidth = 1;
      context.strokeStyle = theme.contentTextDarkGrey(0.5);
      context.fillStyle = theme.contentTextDarkGrey(1);
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.font = '11px sans-serif';
      var maxWidth = this._width + ScrubberChart.TICK_MAX_WIDTH;
      while (x < maxWidth) {
        var tickStr = (tick / divisor).toFixed(precision) + " " + unit;
        context.fillText(tickStr, x - 7, y + 1);
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, this._height + 1);
        context.closePath();
        context.stroke();
        tick += tickInterval;
        x = this._timeToPixel(tick);
      }
    }

    private _calculateTickInterval(startTime: number, endTime: number) {
      // http://stackoverflow.com/a/361687
      var tickCount = this._width / ScrubberChart.TICK_MAX_WIDTH;
      var range = endTime - startTime;
      var minimum = range / tickCount;
      var magnitude = Math.pow(10, Math.floor(Math.log(minimum) / Math.LN10));
      var residual = minimum / magnitude;
      if (residual > 5) {
        return 10 * magnitude;
      } else if (residual > 2) {
        return 5 * magnitude;
      } else if (residual > 1) {
        return 2 * magnitude;
      }
      return magnitude;
    }

    private _drawDragHandle(x: number) {
      var context = this._context;
      context.lineWidth = 2;
      context.strokeStyle = theme.bodyBackground(1);
      context.fillStyle = theme.foregroundTextGrey(0.7);
      this._drawRoundedRect(context, x - ScrubberChart.DRAGHANDLE_WIDTH / 2, 1, ScrubberChart.DRAGHANDLE_WIDTH, this._height - 2, 2, true);
    }

    _timeToPixelRelative(time: number): number {
      var range = (this._type === ScrubberChartType.OVERVIEW)
                    ? this._endTime - this._startTime
                    : this._windowEndTime - this._windowStartTime;
      return time * this._width / range;
    }

    _timeToPixel(time: number): number {
      var start = (this._type === ScrubberChartType.OVERVIEW) ? this._startTime : this._windowStartTime;
      return this._timeToPixelRelative(time - start);
    }

    _pixelToTimeRelative(x: number): number {
      var range = (this._type === ScrubberChartType.OVERVIEW)
                    ? this._endTime - this._startTime
                    : this._windowEndTime - this._windowStartTime;
      return x * range / this._width;
    }

    _pixelToTime(x: number): number {
      var start = (this._type === ScrubberChartType.OVERVIEW) ? this._startTime : this._windowStartTime;
      return this._pixelToTimeRelative(x) + start;
    }
    private _getDragTargetUnderCursor(x: number, y: number): ScrubberChartDragTarget {
      if (y >= 0 && y < this._height) {
        if (this._type === ScrubberChartType.OVERVIEW) {
          var left = this._timeToPixel(this._windowStartTime);
          var right = this._timeToPixel(this._windowEndTime);
          var radius = 2 + (ScrubberChart.DRAGHANDLE_WIDTH) / 2;
          var leftHandle = (x >= left - radius && x <= left + radius);
          var rightHandle = (x >= right - radius && x <= right + radius);
          if (leftHandle && rightHandle) {
            return ScrubberChartDragTarget.HANDLE_BOTH;
          } else if (leftHandle) {
            return ScrubberChartDragTarget.HANDLE_LEFT;
          } else if (rightHandle) {
            return ScrubberChartDragTarget.HANDLE_RIGHT;
          } else if (!this._windowEqRange()) {
            return ScrubberChartDragTarget.WINDOW;
          }
        } else if (!this._windowEqRange()) {
          return ScrubberChartDragTarget.WINDOW;
        }
      }
      return ScrubberChartDragTarget.NONE;
    }

    onMouseDown(x: number, y: number) {
      var dragTarget = this._getDragTargetUnderCursor(x, y);
      if (dragTarget === ScrubberChartDragTarget.WINDOW) {
        this._mouseController.updateCursor(MouseCursor.GRABBING);
      }
      this._dragInfo = <ScrubberDragInfo> {
        windowStartTimeInitial: this._windowStartTime,
        windowEndTimeInitial: this._windowEndTime,
        target: dragTarget
      };
    }

    onMouseMove(x: number, y: number) {
      var cursor = MouseCursor.DEFAULT;
      var dragTarget = this._getDragTargetUnderCursor(x, y);
      if (dragTarget !== ScrubberChartDragTarget.NONE) {
        if (dragTarget !== ScrubberChartDragTarget.WINDOW) {
          cursor = MouseCursor.EW_RESIZE;
        } else if (dragTarget === ScrubberChartDragTarget.WINDOW && !this._windowEqRange()) {
          cursor = MouseCursor.GRAB;
        }
      }
      this._mouseController.updateCursor(cursor);
    }

    onMouseOver(x: number, y: number) {
      this.onMouseMove(x, y);
    }

    onMouseOut() {
      this._mouseController.updateCursor(MouseCursor.DEFAULT);
    }

    onDrag(startX: number, startY: number, currentX: number, currentY: number, deltaX: number, deltaY: number) {
      var dragInfo = this._dragInfo;
      if (dragInfo.target === ScrubberChartDragTarget.HANDLE_BOTH) {
        if (deltaX !== 0) {
          dragInfo.target = (deltaX < 0) ? ScrubberChartDragTarget.HANDLE_LEFT : ScrubberChartDragTarget.HANDLE_RIGHT;
        } else {
          return;
        }
      }
      var windowStartTime = this._windowStartTime;
      var windowEndTime = this._windowEndTime;
      var delta = this._pixelToTimeRelative(deltaX);
      switch (dragInfo.target) {
        case ScrubberChartDragTarget.WINDOW:
          var mult = (this._type === ScrubberChartType.OVERVIEW) ? 1 : -1;
          windowStartTime = dragInfo.windowStartTimeInitial + mult * delta;
          windowEndTime = dragInfo.windowEndTimeInitial + mult * delta;
          break;
        case ScrubberChartDragTarget.HANDLE_LEFT:
          windowStartTime = clamp(dragInfo.windowStartTimeInitial + delta, this._startTime, windowEndTime - TimelineChart.MIN_WINDOW_LENGTH);
          break;
        case ScrubberChartDragTarget.HANDLE_RIGHT:
          windowEndTime = clamp(dragInfo.windowEndTimeInitial + delta, windowStartTime + TimelineChart.MIN_WINDOW_LENGTH, this._endTime);
          break;
        default:
          return;
      }
      this._controller.onWindowChanged(this, windowStartTime, windowEndTime);
    }

    onDragEnd(startX: number, startY: number, currentX: number, currentY: number, deltaX: number, deltaY: number) {
      this._dragInfo = null;
      this.onMouseMove(currentX, currentY);
    }

    onClick(x: number, y: number) {
      if (this._dragInfo.target === ScrubberChartDragTarget.WINDOW) {
        this._mouseController.updateCursor(MouseCursor.GRAB);
      }
    }

    onHoverStart(x: number, y: number) {}
    onHoverEnd() {}

  }

}

