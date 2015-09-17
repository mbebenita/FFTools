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

  interface Selection {
    left: number;
    right: number;
  }

  export class FunctionChart extends ChartBase implements MouseControllerTarget {

    private _overviewCanvasDirty: boolean;
    private _overviewCanvas: HTMLCanvasElement;
    private _overviewContext: CanvasRenderingContext2D;

    private _selection: Selection;
    private _mode: FlameChartOverviewMode;
    private _file: Firefox.File;
    private _location: string;

    constructor(controller: Controller, mode: FlameChartOverviewMode = FlameChartOverviewMode.STACK) {
      this._mode = mode;
      this._overviewCanvasDirty = true;
      this._overviewCanvas = document.createElement("canvas");
      this._overviewContext = this._overviewCanvas.getContext("2d");
      super(controller);
    }

    setFunction(file: Firefox.File, location: string) {
      this._file = file;
      this._location = location;
      this._overviewCanvasDirty = true;
      this.draw();
    }

    setSize(width: number, height?: number) {
      super.setSize(width, height || 64);
    }

    setWindow(start: number, end: number, draw: boolean = true) {
      super.setWindow(start, end, draw);
      this._overviewCanvasDirty = true;
    }

    set mode(value: FlameChartOverviewMode) {
      this._mode = value;
      this.draw();
    }

    _resetCanvas() {
      super._resetCanvas();
      this._overviewCanvas.width = this._canvas.width;
      this._overviewCanvas.height = this._canvas.height;
      this._overviewCanvasDirty = true;
    }

    draw() {
      var context = this._context;
      var ratio = window.devicePixelRatio;
      var width = this._width;
      var height = this._height;

      context.save();
      context.scale(ratio, ratio);
      context.fillStyle = this._controller.theme.bodyBackground(1); //"rgba(17, 19, 21, 1)";
      context.fillRect(0, 0, width, height);
      context.restore();

      if (this._initialized) {
        if (this._overviewCanvasDirty) {
          this._drawChart();
          this._overviewCanvasDirty = false;
        }
        context.drawImage(this._overviewCanvas, 0, 0);
        this._drawSelection();
      }
    }

    private _drawSelection() {
      var context = this._context;
      var height = this._height;
      var ratio = window.devicePixelRatio;
      var left = this._selection ? this._selection.left : this._toPixels(this._windowStart);
      var right = this._selection ? this._selection.right : this._toPixels(this._windowEnd);
      var theme = this._controller.theme;

      context.save();
      context.scale(ratio, ratio);

      // Draw fills
      if (this._selection) {
        context.fillStyle = theme.selectionText(0.15); //"rgba(245, 247, 250, 0.15)";
        context.fillRect(left, 1, right - left, height - 1);
        context.fillStyle = "rgba(133, 0, 0, 1)";
        context.fillRect(left + 0.5, 0, right - left - 1, 4);
        context.fillRect(left + 0.5, height - 4, right - left - 1, 4);
      } else {
        context.fillStyle = theme.bodyBackground(0.4); //"rgba(17, 19, 21, 0.4)";
        context.fillRect(0, 1, left, height - 1);
        context.fillRect(right, 1, this._width, height - 1);
      }

      // Draw border lines
      context.beginPath();
      context.moveTo(left, 0);
      context.lineTo(left, height);
      context.moveTo(right, 0);
      context.lineTo(right, height);
      context.lineWidth = 0.5;
      context.strokeStyle = theme.foregroundTextGrey(1); //"rgba(245, 247, 250, 1)";
      context.stroke();

      // Draw info labels
      var start = this._selection ? this._toTime(this._selection.left) : this._windowStart;
      var end = this._selection ? this._toTime(this._selection.right) : this._windowEnd;
      var time = Math.abs(end - start);
      context.fillStyle = theme.selectionText(0.5); //"rgba(255, 255, 255, 0.5)";
      context.font = '8px Input Mono Condensed';
      context.textBaseline = "alphabetic";
      context.textAlign = "end";
      // Selection Range in MS
      context.fillText(time.toFixed(2), Math.min(left, right) - 4, 10);
      // Selection Range in Frames
      context.fillText((time / 60).toFixed(2), Math.min(left, right) - 4, 20);
      context.restore();
    }

    private _drawChart() {
      if (!this._file) {
        return;
      }
      var ratio = window.devicePixelRatio;
      var width = this._width;
      var height = this._height;
      var profile = this._controller.activeProfile;
      var samplesPerPixel = 4;
      var samplesCount = width * samplesPerPixel;
      var sampleTimeInterval = profile.totalTime / samplesCount;
      var contextOverview = this._overviewContext;
      var overviewChartColor: string = this._controller.theme.blueHighlight(1);

      var start = this._file.profile.threads[0].samples[0].time;
      var flatFunctionProfiles = Firefox.gatherFlatFunctionProfiles(this._file.profile.threads[0], start + this._windowStart, start + this._windowEnd, true);

      var flatFunctionProfile: Firefox.FlatFunctionProfile = null;
      for (var i = 0; i < flatFunctionProfiles.length; i++) {
        if (flatFunctionProfiles[i].location === this._location) {
          flatFunctionProfile = flatFunctionProfiles[i];
          break;
        }
      }

      if (!flatFunctionProfile) {
        return;
      }

      contextOverview.save();
      contextOverview.scale(ratio, ratio);

      // Clear.
      contextOverview.fillStyle = this._controller.theme.bodyBackground(1);
      contextOverview.fillRect(0, 0, this._width, this._height);

      contextOverview.fillStyle = this._controller.theme.blueHighlight(0.2);
      var samples = flatFunctionProfile.samples;


      var a = samples[0];
      var b = samples[samples.length - 1];

      var s = a.time - start;
      var e = b.time - s;
      var bucketPixelWidth = 5;
      var buckets = new Array(this._width / bucketPixelWidth | 0);
      for (var i = 0; i < buckets.length; i++) {
        buckets[i] = [];
      }

      // Put samples in buckets.
      for (var i = 0; i < samples.length; i++) {
        var sample: Firefox.Sample = samples[i];
        var x = this._toPixels(sample.time - start) | 0;
        var bucketIndex = Math.min(buckets.length - 1, x / bucketPixelWidth | 0);
        buckets[bucketIndex].push(sample);
      }

      contextOverview.fillStyle = "white";
      for (var i = 0; i < buckets.length; i++) {
        var bucket = buckets[i];
        if (bucket.length) {
          for (var j = 0; j < bucket.length; j++) {
            var sample: Firefox.Sample = bucket[j];
            var lastFrame = sample.frames[sample.frames.length - 1];
            switch (lastFrame.implementation) {
              case "interpreter":
                contextOverview.fillStyle = this._controller.theme.redHighlight(1);
                break;
              case "baseline":
                contextOverview.fillStyle = this._controller.theme.blueHighlight(1);
                break;
              case "ion":
                contextOverview.fillStyle = this._controller.theme.greenHighlight(1);
                break;
            }
            contextOverview.fillRect(i * bucketPixelWidth, j * (4 + 1), bucketPixelWidth - 1, 4);
          }
        }
      }

      contextOverview.restore();

    }

    //_toPixelsRelative(time: number): number {
    //  return time * this._width / (this._rangeEnd - this._rangeStart);
    //}
    //
    //_toPixels(time: number): number {
    //  return this._toPixelsRelative(time - this._rangeStart);
    //}
    //
    //_toTimeRelative(px: number): number {
    //  return px * (this._rangeEnd - this._rangeStart) / this._width;
    //}
    //
    //_toTime(px: number): number {
    //  return this._toTimeRelative(px) + this._rangeStart;
    //}
    //
    //private _getDragTargetUnderCursor(x: number, y:number): FlameChartDragTarget {
    //  if (y >= 0 && y < this._height) {
    //    var left = this._toPixels(this._windowStart);
    //    var right = this._toPixels(this._windowEnd);
    //    var radius = 2 + (ChartBase.DRAGHANDLE_WIDTH) / 2;
    //    var leftHandle = (x >= left - radius && x <= left + radius);
    //    var rightHandle = (x >= right - radius && x <= right + radius);
    //    if (leftHandle && rightHandle) {
    //      return FlameChartDragTarget.HANDLE_BOTH;
    //    } else if (leftHandle) {
    //      return FlameChartDragTarget.HANDLE_LEFT;
    //    } else if (rightHandle) {
    //      return FlameChartDragTarget.HANDLE_RIGHT;
    //    } else if (!this._windowEqRange() && x > left + radius && x < right - radius) {
    //      return FlameChartDragTarget.WINDOW;
    //    }
    //  }
    //  return FlameChartDragTarget.NONE;
    //}
    //
    //onMouseDown(x: number, y: number) {
    //  var dragTarget = this._getDragTargetUnderCursor(x, y);
    //  if (dragTarget === FlameChartDragTarget.NONE) {
    //    this._selection = { left: x, right: x };
    //    this.draw();
    //  } else {
    //    if (dragTarget === FlameChartDragTarget.WINDOW) {
    //      this._mouseController.updateCursor(MouseCursor.GRABBING);
    //    }
    //    this._dragInfo = <FlameChartDragInfo>{
    //      windowStartInitial: this._windowStart,
    //      windowEndInitial: this._windowEnd,
    //      target: dragTarget
    //    };
    //  }
    //}
    //
    //onMouseMove(x: number, y: number) {
    //  var cursor = MouseCursor.DEFAULT;
    //  var dragTarget = this._getDragTargetUnderCursor(x, y);
    //  if (dragTarget !== FlameChartDragTarget.NONE && !this._selection) {
    //    cursor = (dragTarget === FlameChartDragTarget.WINDOW) ? MouseCursor.GRAB : MouseCursor.EW_RESIZE;
    //  }
    //  this._mouseController.updateCursor(cursor);
    //}
    //
    //onMouseOver(x: number, y: number) {
    //  this.onMouseMove(x, y);
    //}
    //
    //onMouseOut() {
    //  this._mouseController.updateCursor(MouseCursor.DEFAULT);
    //}
    //
    //onDrag(startX: number, startY: number, currentX: number, currentY: number, deltaX: number, deltaY: number) {
    //  if (this._selection) {
    //    this._selection = { left: startX, right: clamp(currentX, 0, this._width - 1) };
    //    this.draw();
    //  } else {
    //    var dragInfo = this._dragInfo;
    //    if (dragInfo.target === FlameChartDragTarget.HANDLE_BOTH) {
    //      if (deltaX !== 0) {
    //        dragInfo.target = (deltaX < 0) ? FlameChartDragTarget.HANDLE_LEFT : FlameChartDragTarget.HANDLE_RIGHT;
    //      } else {
    //        return;
    //      }
    //    }
    //    var windowStart = this._windowStart;
    //    var windowEnd = this._windowEnd;
    //    var delta = this._toTimeRelative(deltaX);
    //    switch (dragInfo.target) {
    //      case FlameChartDragTarget.WINDOW:
    //        windowStart = dragInfo.windowStartInitial + delta;
    //        windowEnd = dragInfo.windowEndInitial + delta;
    //        break;
    //      case FlameChartDragTarget.HANDLE_LEFT:
    //        windowStart = clamp(dragInfo.windowStartInitial + delta, this._rangeStart, windowEnd - ChartBase.MIN_WINDOW_LEN);
    //        break;
    //      case FlameChartDragTarget.HANDLE_RIGHT:
    //        windowEnd = clamp(dragInfo.windowEndInitial + delta, windowStart + ChartBase.MIN_WINDOW_LEN, this._rangeEnd);
    //        break;
    //      default:
    //        return;
    //    }
    //    this._controller.setWindow(windowStart, windowEnd);
    //  }
    //}
    //
    //onDragEnd(startX: number, startY: number, currentX: number, currentY: number, deltaX: number, deltaY: number) {
    //  if (this._selection) {
    //    this._selection = null;
    //    this._controller.setWindow(this._toTime(startX), this._toTime(currentX));
    //  }
    //  this._dragInfo = null;
    //  this.onMouseMove(currentX, currentY);
    //}
    //
    //onClick(x: number, y: number) {
    //  this._dragInfo = null;
    //  this._selection = null;
    //  if (!this._windowEqRange()) {
    //    var dragTarget = this._getDragTargetUnderCursor(x, y);
    //    if (dragTarget === FlameChartDragTarget.NONE) {
    //      this._controller.moveWindowTo(this._toTime(x));
    //    }
    //    this.onMouseMove(x, y);
    //  }
    //  this.draw();
    //}
    //
    //onHoverStart(x: number, y: number) {}
    //onHoverEnd() {}

  }
}
