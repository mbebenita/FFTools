module Tools {
  import SampleGroup = Tools.Profiler.SampleGroup;
  import Marker = Profiler.Marker;
  import Thread = Profiler.Thread;
  import File = Profiler.File;
  import TimelineFrame = Profiler.TimelineFrame;
  import TimelineBuffer = Profiler.TimelineBuffer;
  import TimelineFrameRange = Profiler.TimelineFrameRange;
  import TimelineBufferSnapshot = Profiler.TimelineBufferSnapshot;
  import TimelineItemKind = Profiler.TimelineItemKind;
  import TimelineFrameStatistics = Profiler.TimelineFrameStatistics;
  export var theme: UITheme = new UIThemeDark();

  export interface MouseControllerTarget {
    onMouseDown(x: number, y: number): void;
    onMouseMove(x: number, y: number): void;
    onMouseOver(x: number, y: number): void;
    onMouseOut(): void;
    onMouseWheel(x: number, y: number, delta: number): boolean;
    onDrag(startX: number, startY: number, currentX: number, currentY: number, deltaX: number, deltaY: number): void;
    onDragEnd(startX: number, startY: number, currentX: number, currentY: number, deltaX: number, deltaY: number): void;
    onClick(x: number, y: number): void;
    onHoverStart(x: number, y: number): void;
    onHoverEnd(): void;
  }

  export class Chart {
    protected _container: HTMLDivElement;
    protected _canvas: HTMLCanvasElement;
    protected _context: CanvasRenderingContext2D;
    protected _canvasWidth: number;
    protected _canvasHeight: number;
    protected _width: number;
    protected _height: number;
    protected _dirty: boolean;
    protected _ratio: number;
    constructor(container: HTMLDivElement) {
      this._container = container;
      this._canvas = document.createElement("canvas");
      this._context = this._canvas.getContext("2d");
      this._canvasWidth = this._width = 0;
      this._canvasHeight = this._height = 0;
      this._dirty = true;
      container.appendChild(this._canvas);
      this.setSize(600, 30);
      this._resetCanvas();
      this._enterRenderLoop();
    }
    protected _resetCanvas() {
      var canvas = this._canvas;
      canvas.width = this._canvasWidth;
      canvas.height = this._canvasHeight;
      canvas.style.width = this._width + "px";
      canvas.style.height = this._height + "px";
    }
    protected _clearCanvas() {
      this._context.fillStyle = theme.bodyBackground();
      this._context.fillRect(0, 0, this._width, this._height);
    }
    private _enterRenderLoop() {
      var self = this;
      requestAnimationFrame(function tick() {
        self.render()
        requestAnimationFrame(tick);
      });
    }
    render() {

    }
    protected _invalidate() {
      this._dirty = true;
    }
    public setSize(width: number, height: number) {
      this._width = width | 0;
      this._height = height | 0;
      this._ratio = window.devicePixelRatio;
      this._canvasWidth = width * this._ratio | 0;
      this._canvasHeight = height * this._ratio | 0;
      this._resetCanvas();
      this._context.setTransform(this._ratio, 0, 0, this._ratio, 0, 0);
      this._invalidate();
    }
    protected _decimalPlaces(value: number): number {
      return ((+value).toFixed(10)).replace(/^-?\d*\.?|0+$/g, '').length;
    }
    protected _drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, stroke: boolean = true, fill: boolean = true) {
      context.beginPath();
      context.moveTo(x + radius, y);
      context.lineTo(x + width - radius, y);
      context.quadraticCurveTo(x + width, y, x + width, y + radius);
      context.lineTo(x + width, y + height - radius);
      context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      context.lineTo(x + radius, y + height);
      context.quadraticCurveTo(x, y + height, x, y + height - radius);
      context.lineTo(x, y + radius);
      context.quadraticCurveTo(x, y, x + radius, y);
      context.closePath();
      if (stroke) {
        context.stroke();
      }
      if (fill) {
        context.fill();
      }
    }
  }
  export class InteractiveChart extends Chart implements MouseControllerTarget {
    protected _mouseController: MouseController;
    constructor(container: HTMLDivElement) {
      super(container);
      this._mouseController = new MouseController(this, this._canvas);
    }
    onMouseWheel(x: number, y: number, delta: number) { return false; }
    onMouseDown(x:number, y:number): void {}
    onMouseMove(x:number, y:number): void {}
    onMouseOver(x:number, y:number): void {}
    onMouseOut(): void {}
    onDrag(startX:number, startY:number, currentX:number, currentY:number, deltaX:number, deltaY:number): void {}
    onDragEnd(startX:number, startY:number, currentX:number, currentY:number, deltaX:number, deltaY:number): void {}
    onClick(x:number, y:number): void {}
    onHoverStart(x:number, y:number): void {}
    onHoverEnd(): void {}
  }
  export class TimelineController {
    protected _targets: TimelineControllerTarget [];
    constructor() {
      this._targets = [];
    }
    addTarget(target: TimelineControllerTarget) {
      this._targets.push(target);
    }
    onTimeChanged(source: TimelineControllerTarget, time: number) {
      this._targets.forEach(target => target.setTime(time));
    }
    onWindowChanged(source: TimelineControllerTarget, startTime: number, endTime: number) {
      this._targets.forEach(target => target.setWindow(startTime, endTime));
    }
  }
  export interface TimelineControllerTarget {
    setRange(startTime: number, endTime: number);
    setWindow(startTime: number, endTime: number);
    setTime(time: number);
  }
  export class TimelineChart extends InteractiveChart implements TimelineControllerTarget {
    private _time: number;
    protected _startTime: number;
    protected _endTime: number;
    protected _windowStartTime;
    protected _windowEndTime;
    protected _controller: TimelineController;
    protected _allowZooming: boolean = false;
    private _textWidth = {};
    static MIN_WINDOW_LENGTH = 0.1;
    constructor(container: HTMLDivElement, timelineController: TimelineController) {
      super(container);
      this._time = this._startTime = this._endTime = 0;
      this._windowStartTime = this._windowEndTime = 0;
      this._controller = timelineController;
    }
    setRangeAndWindow(startTime: number, endTime: number) {
      this.setRange(startTime, endTime);
      this.setWindow(startTime, endTime);
    }
    setRange(startTime: number, endTime: number) {
      assert(endTime >= startTime);
      this._startTime = startTime;
      this._endTime = endTime;
      this._invalidate();
    }
    setWindow(startTime: number, endTime: number) {
      assert(endTime >= startTime);
      this._windowStartTime = startTime;
      this._windowEndTime = endTime;
      this._invalidate();
    }
    setTime(time: number) {
      this._time = time;
      this._invalidate();
    }
    protected _prepareText(context: CanvasRenderingContext2D, title: string, maxSize: number):string {
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
    protected _timeToRatio(time: number) {
      return (time - this._windowStartTime) / (this._windowEndTime - this._windowStartTime);
    }
    protected _timeToPixel(time: number) {
      return this._timeToRatio(time) * this._width | 0;
    }
    protected _pixelToTime(x: number): number {
      return this._windowStartTime + x * (this._windowEndTime - this._windowStartTime) / this._width;
    }
    protected _timeToBucket(time: number, bucketWidth: number) {
      return (this._timeToRatio(time) * (this._width / bucketWidth)) | 0;
    }
    _drawTime() {
      var x = this._timeToPixel(this._time);
      this._context.setLineDash([1,2]);
      this._context.strokeStyle = theme.timeMarker();
      this._context.beginPath();
      this._context.setLineDash([1,2]);
      this._context.moveTo(x, 0);
      this._context.lineTo(x, this._height);
      this._context.stroke();
    }
    protected _windowEqRange(): boolean {
      return (almostEq(this._windowStartTime, this._startTime) && almostEq(this._windowEndTime, this._endTime));
    }
    onMouseWheel(x: number, y: number, delta: number): boolean {
      if (!this._allowZooming) return false;
      var time = this._pixelToTime(x);
      var windowStart = this._windowStartTime;
      var windowEnd = this._windowEndTime;
      var range = windowEnd - windowStart;
      /*
       * Find maximum allowed delta
       * (windowEnd + (windowEnd - time) * delta) - (windowStart + (windowStart - time) * delta) = LEN
       * (windowEnd - windowStart) + ((windowEnd - time) * delta) - ((windowStart - time) * delta) = LEN
       * (windowEnd - windowStart) + ((windowEnd - time) - (windowStart - time)) * delta = LEN
       * (windowEnd - windowStart) + (windowEnd - windowStart) * delta = LEN
       * (windowEnd - windowStart) * delta = LEN - (windowEnd - windowStart)
       * delta = (LEN - (windowEnd - windowStart)) / (windowEnd - windowStart)
       */
      var maxDelta = Math.max((TimelineChart.MIN_WINDOW_LENGTH - range) / range, delta);
      var start = windowStart + (windowStart - time) * maxDelta;
      var end = windowEnd + (windowEnd - time) * maxDelta;
      this._controller.onWindowChanged(this, start, end);
      this.onHoverEnd();
      return true;
    }
  }
  export class FunctionTimelineChart extends TimelineChart {
    private _group: SampleGroup;
    private _bucketWidth: number;
    constructor(container: HTMLDivElement, timelineController: TimelineController) {
      super(container, timelineController);
      this._bucketWidth = 2;
    }
    setData(group: SampleGroup) {
      this._group = group;
      this._invalidate();
    }
    setBucketWidth(bucketWidth: number) {
      this._bucketWidth = bucketWidth | 0;
      this._invalidate();
    }
    render() {
      if (!this._dirty || !this._group) return;
      this._clearCanvas();
      this._drawTime();
      var samples = this._group.samples;
      var bucketWidth = this._bucketWidth;
      var bucketPadding = 1;
      var totalBucketWidth = bucketWidth + bucketPadding;
      var bucketCount = this._width / totalBucketWidth | 0;

      var buckets = new Int32Array(bucketCount);
      for (var i = 0; i < samples.length; i++) {
        buckets[this._timeToBucket(samples[i].time, totalBucketWidth)] ++;
      }
      for (var i = 0; i < buckets.length; i++) {
        var h = buckets[i];
        var j = 1;
        while (h > 0) {
          this._context.fillStyle = theme.horizon(j++);
          var y = Math.max(h, 2);
          this._context.fillRect(i * totalBucketWidth, this._height - y, bucketWidth, y);
          h -= this._height;
        }
      }
      this._dirty = false;
    }
    onMouseMove(x: number, y: number): void {
      var t = this._pixelToTime(x);
      this._controller.onTimeChanged(this, t);
      this.setTime(t);
    }
  }
  export class MarkerTimelineChart extends TimelineChart {
    protected _snapshot: TimelineBufferSnapshot;
    protected _treeWidth: number;
    protected _rowHeight = 16;
    protected _rowHeightPadding = 1;
    private _range: TimelineFrameRange;
    constructor(container: HTMLDivElement, timelineController: TimelineController) {
      super(container, timelineController);
      this._treeWidth = 256;
    }
    setFileData(file: File) {
      this._snapshot = Tools.Profiler.TimelineBuffer.FromFirefoxFileMarkers(file).createSnapshot();
      this._invalidate();
      this._allowZooming = false;
    }
    private _x = 0;
    private _y = 0;
    private _scrollYOffset = 0;
    private _selectedRowIndex = 2;
    private get _maxScrollY() {
      return this._range.endIndex * (this._rowHeight + this._rowHeightPadding);
    }
    setWindow(startTime: number, endTime: number) {
      super.setWindow(startTime, endTime);
      this._range = this._snapshot.getChildRange(this._windowStartTime, this._windowEndTime);
      // this._scrollYOffset = 0;
    }
    render() {
      if (!this._dirty || !this._snapshot) return;
      this._clearCanvas();
      this._x = this._y = 0;
      this._drawChildren(this._snapshot);
    }
    private _rangeStartIndex: number;
    private _rangeEndIndex: number;

    private _drawChildren(parent: TimelineFrame, depth: number = 0) {
      if (this._range && parent.children) {
        var a = depth === 0 ? this._range.startIndex : 0;
        var b = depth === 0 ? this._range.endIndex : parent.children.length;
        this._context.save();
        this._context.translate(0, -this._scrollYOffset);
        for (var i = a; i < b; i++) {
          var child = parent.children[i];
          this._drawRow(child, depth);
          this._y ++;
          // if (this._drawRow(child, depth)) {
            // this._drawChildren(child, depth + 1);
          // }
        }
        this._context.restore();
      }
    }
    private _drawRow(frame: TimelineFrame, depth: number): boolean {
      var context = this._context;
      var rowHeight = this._rowHeight;
      var rowHeightPadding = this._rowHeightPadding;
      var labelXOffset = 8 * (depth + 1);

      // Draw Row
      if (this._y === this._selectedRowIndex) {
        context.fillStyle = theme.blueHighlight(0.5);
      } else {
        context.fillStyle = theme.blueHighlight(this._y % 2 ? 0.2 : 0.1);
      }
      context.fillRect(0, this._y * (rowHeight + rowHeightPadding), this._width, rowHeight);
      context.fillStyle = theme.bodyText();

      // Draw Label
      var label = this._prepareText(context, frame.kind.name, this._treeWidth - labelXOffset * 2);
      context.textBaseline = "middle";
      context.font = '10px Input Mono Condensed';
      context.fillText(label, labelXOffset, (this._y + 1) * (rowHeight + rowHeightPadding) - rowHeight / 2);

      // Draw Marker
      var markerY = this._y * (rowHeight + rowHeightPadding) + 1;
      var markerWidth = 4;
      var markerX = this._timeToPixel(frame.startTime) | 0;
      var markerWidth = this._timeToPixel(frame.endTime) - markerX | 0;
      var markerHeight = rowHeight - 6;
      context.fillRect(markerX, markerY + 2, markerWidth, markerHeight);
      // context.fillText(frame.totalTime, labelXOffset + markerWidth, markerY + 2);
      context.fillText("" + frame.totalTime.toFixed(2), markerX + markerWidth + 10, (this._y + 1) * (rowHeight + rowHeightPadding) - rowHeight / 2);
      this._drawRoundedRect(context, markerX, markerY, 4, rowHeight - 2, 2, true);
      return true;
    }
    protected _timeToPixel(time: number) {
      return this._treeWidth + this._timeToRatio(time) * (this._width - this._treeWidth) | 0;
    }
    protected _pixelToRowIndex(y: number): number {
      return y / (this._rowHeight + this._rowHeightPadding) | 0;
    }
    protected _rowIndexToFrame(i: number): TimelineFrame {
      return this._snapshot.children[i];
    }
    onMouseMove(x: number, y: number) {
      //var t = this._pixelToTime(x);
      //this._controller.onTimeChanged(this, t);
      //this.setTime(t);
      //var frame = this._rowIndexToFrame(this._pixelToRowIndex(y));
      //if (frame) {
      //  if (this._selectedRow) {
      //    this._selectedRow.data.selected = false;
      //  }
      //  frame.data = {selected: true};
      //  this._selectedRow = frame;
      //}
      //this._invalidate();
    }
    onMouseWheel(x: number, y: number, delta: number) {
      var height = this._rowHeight + this._rowHeightPadding;
      this._scrollYOffset = clamp(this._scrollYOffset + delta * height * 8, 0, this._maxScrollY);
      console.info(this._scrollYOffset);
      return true;
    }
  }
}