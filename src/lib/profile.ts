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
  export module CleopatraJSON {

  }
  export module JSON {
    export interface Type {
      keyedBy: string;
      name: string;
      location: string;
      line: number
    }
    export interface OptimizationType {
      types: Type [];
      site: string;
      mirType: string;
    }
    export interface Attempt {
      strategy: string;
      outcome: string;
    }
    export interface RawOptimizationSite {
      types: OptimizationType [];
      attempts: Attempt [];
      samples: number;
      location: string;
      line: number;
      column: number;
    }
    export interface Frame {
      line: number;
      source: string;
      functionDisplayName: string;
    }
    export interface Samples {
      data: any [];
      schema: any;
    }
    export interface Markers {
      data: any [];
      schema: any;
    }
    export interface FrameTable {
      data: any [];
      schema: any;
    }
    export interface StackTable {
      data: any [];
      schema: any;
    }
    export interface Sample {
      frames: Frame [];
      responsiveness: number;
      time: number;
    }
    export interface Thread {
      name: string;
      tid: number;
      frameTable: FrameTable;
      stackTable: StackTable;
      stringTable: string [];
      samples: Samples;
      optimizations: RawOptimizationSite [];
      markers: Markers;
    }
    export interface Allocations {
      sites: number [];
      timestamps: number [];
      frames: any [];
      counts: number [];
    }
    export interface File {
      label: string;
      duration: number;
      markers: any [];
      frames: any [];
      memory: any [];
      ticks: any [];
      allocations: Allocations;
      profile: {
        libs: any;
        meta: any;
        threads: Thread [];
      };
      fileType: string;
      version: number;
      profileJSON?: any;
    }

    var showGeckoPlatformData = true;

    var CHROME_SCHEMES = ["chrome://", "resource://", "jar:file://"];
    var CONTENT_SCHEMES = ["http://", "https://", "file://", "app://"];

    //function isContent(frame: Frame) {
    //  // Only C++ stack frames have associated category information.
    //  if (frame.category) {
    //    return false;
    //  }
    //  for (var i = 0; i < CONTENT_SCHEMES.length; i++) {
    //    var scheme = CONTENT_SCHEMES[i];
    //    if (frame.location.indexOf(scheme) >= 0) {
    //      return true;
    //    }
    //  }
    //  return false;
    //}
  }

  var CHAR_CODE_A = "a".charCodeAt(0);
  var CHAR_CODE_C = "c".charCodeAt(0);
  var CHAR_CODE_E = "e".charCodeAt(0);
  var CHAR_CODE_F = "f".charCodeAt(0);
  var CHAR_CODE_H = "h".charCodeAt(0);
  var CHAR_CODE_I = "i".charCodeAt(0);
  var CHAR_CODE_J = "j".charCodeAt(0);
  var CHAR_CODE_L = "l".charCodeAt(0);
  var CHAR_CODE_M = "m".charCodeAt(0);
  var CHAR_CODE_O = "o".charCodeAt(0);
  var CHAR_CODE_P = "p".charCodeAt(0);
  var CHAR_CODE_R = "r".charCodeAt(0);
  var CHAR_CODE_S = "s".charCodeAt(0);
  var CHAR_CODE_T = "t".charCodeAt(0);
  var CHAR_CODE_U = "u".charCodeAt(0);
  var CHAR_CODE_0 = "0".charCodeAt(0);
  var CHAR_CODE_9 = "9".charCodeAt(0);

  var CHAR_CODE_LPAREN = "(".charCodeAt(0);
  var CHAR_CODE_QUOTE = "\"".charCodeAt(0);
  var CHAR_CODE_COLON = ":".charCodeAt(0);
  var CHAR_CODE_SLASH = "/".charCodeAt(0);

  function isDigit(c: number) {
    return c >= CHAR_CODE_0 && c <= CHAR_CODE_9;
  }

  function nsIURL(s) {
    return s;
  }


  /**
   * Takes a `host` string from an nsIURL instance and
   * returns the same string, or null, if it's an invalid host.
   */
  function getHost (url, hostName) {
    return isChromeScheme(url, 0) ? null : hostName;
  }

// For the functions below, we assume that we will never access the location
// argument out of bounds, which is indeed the vast majority of cases.
//
// They are written this way because they are hot. Each frame is checked for
// being content or chrome when processing the profile.

  function isColonSlashSlash(location, i) {
    return location.charCodeAt(++i) === CHAR_CODE_COLON &&
           location.charCodeAt(++i) === CHAR_CODE_SLASH &&
           location.charCodeAt(++i) === CHAR_CODE_SLASH;
  }

  function isContentScheme(location, i) {
    var firstChar = location.charCodeAt(i);

    switch (firstChar) {
      case CHAR_CODE_H: // "http://" or "https://"
        if (location.charCodeAt(++i) === CHAR_CODE_T &&
            location.charCodeAt(++i) === CHAR_CODE_T &&
            location.charCodeAt(++i) === CHAR_CODE_P) {
          if (location.charCodeAt(i + 1) === CHAR_CODE_S) {
            ++i;
          }
          return isColonSlashSlash(location, i);
        }
        return false;

      case CHAR_CODE_F: // "file://"
        if (location.charCodeAt(++i) === CHAR_CODE_I &&
            location.charCodeAt(++i) === CHAR_CODE_L &&
            location.charCodeAt(++i) === CHAR_CODE_E) {
          return isColonSlashSlash(location, i);
        }
        return false;

      case CHAR_CODE_A: // "app://"
        if (location.charCodeAt(++i) == CHAR_CODE_P &&
            location.charCodeAt(++i) == CHAR_CODE_P) {
          return isColonSlashSlash(location, i);
        }
        return false;

      default:
        return false;
    }
  }

  function isChromeScheme(location, i) {
    var firstChar = location.charCodeAt(i);

    switch (firstChar) {
      case CHAR_CODE_C: // "chrome://"
        if (location.charCodeAt(++i) === CHAR_CODE_H &&
           location.charCodeAt(++i) === CHAR_CODE_R &&
           location.charCodeAt(++i) === CHAR_CODE_O &&
           location.charCodeAt(++i) === CHAR_CODE_M &&
           location.charCodeAt(++i) === CHAR_CODE_E) {
          return isColonSlashSlash(location, i);
        }
        return false;

      case CHAR_CODE_R: // "resource://"
        if (location.charCodeAt(++i) === CHAR_CODE_E &&
           location.charCodeAt(++i) === CHAR_CODE_S &&
           location.charCodeAt(++i) === CHAR_CODE_O &&
           location.charCodeAt(++i) === CHAR_CODE_U &&
           location.charCodeAt(++i) === CHAR_CODE_R &&
           location.charCodeAt(++i) === CHAR_CODE_C &&
           location.charCodeAt(++i) === CHAR_CODE_E) {
          return isColonSlashSlash(location, i);
        }
        return false;

      case CHAR_CODE_J: // "jar:file://"
        if (location.charCodeAt(++i) === CHAR_CODE_A &&
           location.charCodeAt(++i) === CHAR_CODE_R &&
           location.charCodeAt(++i) === CHAR_CODE_COLON &&
           location.charCodeAt(++i) === CHAR_CODE_F &&
           location.charCodeAt(++i) === CHAR_CODE_I &&
           location.charCodeAt(++i) === CHAR_CODE_L &&
           location.charCodeAt(++i) === CHAR_CODE_E) {
          return isColonSlashSlash(location, i);
        }
        return false;

      default:
        return false;
    }
  }

  export class Location {
    original: string;
    functionName: string;
    fileName: string;
    hostName: string;
    port: number;
    url: string;
    line: number;
    column: number;

    constructor(location: string, fallbackLine: number, fallbackColumn: number) {
      // Parse the `location` for the function name, source url, line, column etc.
      this.original = location;
      var line, column, url;

      // These two indices are used to extract the resource substring, which is
      // location[firstParenIndex + 1 .. lineAndColumnIndex].
      //
      // The resource substring is extracted iff a line number was found. There
      // may be no parentheses, in which case the substring starts at 0.
      //
      // For example, take "foo (bar.js:1)".
      //                        ^      ^
      //                        |      -----+
      //                        +-------+   |
      //                                |   |
      // firstParenIndex will point to -+   |
      //                                    |
      // lineAndColumnIndex will point to --+
      //
      // For an example without parentheses, take "bar.js:2".
      //                                          ^      ^
      //                                          |      |
      // firstParenIndex will point to -----------+      |
      //                                                 |
      // lineAndColumIndex will point to ----------------+
      var firstParenIndex = -1;
      var lineAndColumnIndex = -1;

      // Compute firstParenIndex and lineAndColumnIndex. If lineAndColumnIndex is
      // found, also extract the line and column.
      for (var i = 0; i < location.length; i++) {
        var c = location.charCodeAt(i);

        // The url and line information might be inside parentheses.
        if (c === CHAR_CODE_LPAREN) {
          if (firstParenIndex < 0) {
            firstParenIndex = i;
          }
          continue;
        }

        // Look for numbers after colons, twice. Firstly for the line, secondly
        // for the column.
        if (c === CHAR_CODE_COLON) {
          if (isDigit(location.charCodeAt(i + 1))) {
            // If we found a line number, remember when it starts.
            if (lineAndColumnIndex < 0) {
              lineAndColumnIndex = i;
            }

            var start = ++i;
            var length = 1;
            while (isDigit(location.charCodeAt(++i))) {
              length++;
            }

            // Discard port numbers
            if (location.charCodeAt(i) === CHAR_CODE_SLASH) {
              lineAndColumnIndex = -1;
              --i;
              continue;
            }

            if (!line) {
              line = location.substr(start, length);

              // Unwind a character due to the isDigit loop above.
              --i;

              // There still might be a column number, continue looking.
              continue;
            }

            column = location.substr(start, length);

            // We've gotten both a line and a column, stop looking.
            break;
          }
        }
      }

      var uri;
      if (lineAndColumnIndex > 0) {
        var resource = location.substring(firstParenIndex + 1, lineAndColumnIndex);
        url = resource.split(" -> ").pop();
        if (url) {
          uri = nsIURL(url);
        }
      }

      var functionName, fileName, hostName, port, host;
      line = line || fallbackLine;
      column = column || fallbackColumn;

      // If the URI digged out from the `location` is valid, this is a JS frame.
      if (uri) {
        functionName = location.substring(0, firstParenIndex - 1);
        fileName = uri.fileName || "/";
        hostName = getHost(url, uri.host);
        // nsIURL throws when accessing a piece of a URL that doesn't
        // exist, because we can't have nice things. Only check this if hostName
        // exists, to save an extra try/catch.
        if (hostName) {
          try {
            port = uri.port === -1 ? null : uri.port;
            host = port !== null ? `${hostName}:${port}` : hostName;
          } catch (e) {
            host = hostName;
          }
        }
      } else {
        functionName = location;
        url = null;
      }

      this.functionName = functionName;
      this.fileName = fileName;
      this.hostName = hostName;
      this.port = port;
      this.url = url;
      this.line = line;
      this.column = column;
    }

    toString() {
      return this.functionName + ":" + this.line;
    }
  }

  enum FrameSchema {
    Location = 0,
    Implementation,
    Optimizations,
    Line,
    Category
  }

  function checkFrameSchema(frameTable: JSON.FrameTable) {
    assert(frameTable.schema.location === FrameSchema.Location);
    assert(frameTable.schema.implementation === FrameSchema.Implementation);
    assert(frameTable.schema.optimizations === FrameSchema.Optimizations);
    assert(frameTable.schema.line === FrameSchema.Line);
    assert(frameTable.schema.category === FrameSchema.Category);
  }

  var nextFrameId = 0;

  var locationCache = Object.create(null);
  function makeLocation(location: string, fallbackLine: number, fallbackColumn: number) {
    var r = locationCache[location];
    if (r) {
      return r;
    }
    return locationCache[location] = new Location(location, fallbackLine, fallbackColumn);
  }

  export enum Implementation {
    Interpreter = 0,
    Baseline,
    Ion,
    Native
  }

  export class Frame {
    id = nextFrameId ++;
    location: Location;
    implementation: any;
    optimizations: any;
    line: number;
    category: any;

    constructor(thread: Thread, json: any) {
      if (!json[FrameSchema.Implementation]) {
        this.implementation = Implementation.Native;
      } else {
        var implementation = thread.getString(json[FrameSchema.Implementation]);
        switch (implementation) {
          case "interpreter":
            this.implementation = Implementation.Interpreter;
            break;
          case "baseline":
            this.implementation = Implementation.Baseline;
            break;
          case "ion":
            this.implementation = Implementation.Ion;
            break;
          default:
            assert(false);
        }
      }
      this.optimizations = json[FrameSchema.Optimizations];
      this.line = json[FrameSchema.Line] | 0;
      this.category = json[FrameSchema.Category];
      this.location = makeLocation(thread.getString(json[FrameSchema.Location]), this.line, -1);
    }

    toString() {
      return this.location + ", " +
             this.implementation + ", " +
             this.optimizations + ", " +
             this.line + ", " +
             this.category;
    }
  }

  enum StackSchema {
    Prefix = 0,
    Frame,
  }

  function checkStackSchema(stackTable: JSON.StackTable) {
    assert(stackTable.schema.prefix === StackSchema.Prefix);
    assert(stackTable.schema.frame === StackSchema.Frame);
  }

  enum StackFlags {
    None = 0,
    Mark = 1
  }

  export class Stack {
    private _flags: StackFlags = StackFlags.None;
    constructor(public prefix: Stack, public frame: Frame) {
    }
    getHeight(): number {
      var s = this.prefix;
      var h = 0;
      while (s) {
        h ++;
        s = s.prefix;
      }
      return h;
    }
    getPrefix(i: number) {
      var s = this;
      while (s && i--) {
        s = s.prefix;
      }
      return s;
    }
    getCommonPrefix(other: Stack): Stack {
      var s = this;
      // Mark Ancestors
      while (s) {
        s._flags |= StackFlags.Mark;
        s = s.prefix;
      }
      // Find Mark
      var s = other, r = null;
      while (s) {
        if (s._flags & StackFlags.Mark) {
          r = s;
          break;
        }
        s = s.prefix;
      }
      // Clear Mark
      s = this;
      while (s) {
        s._flags &= ~StackFlags.Mark;
        s = s.prefix;
      }
      return r;
    }
    trace() {
      var s = this;
      while (s) {
        console.info(s.frame.location);
        s = s.prefix;
      }
    }
  }

  enum SampleSchema {
    Stack = 0,
    Time,
    Responsiveness,
    RSS,
    USS,
    FrameNumber,
    Power
  }

  function checkSampleSchema(samples: JSON.Samples) {
    assert(samples.schema.stack === SampleSchema.Stack);
    assert(samples.schema.time === SampleSchema.Time);
    assert(samples.schema.responsiveness === SampleSchema.Responsiveness);
    assert(samples.schema.rss === SampleSchema.RSS);
    assert(samples.schema.uss === SampleSchema.USS);
    assert(samples.schema.frameNumber === SampleSchema.FrameNumber);
    assert(samples.schema.power === SampleSchema.Power);
  }

  enum MarkerSchema {
    Name = 0,
    Time,
    Data
  }

  function checkMarkerSchema(markers: JSON.Markers) {
    assert(markers.schema.name === MarkerSchema.Name);
    assert(markers.schema.time === MarkerSchema.Time);
    assert(markers.schema.data === MarkerSchema.Data);
  }

  export class Sample {
    stack: Stack;
    time: number;
    responsiveness: any;
    rss: any;
    uss: any;
    frame: Frame;
    power: any;
    constructor(thread: Thread, json: any) {
      this.stack = thread.stacks[json[SampleSchema.Stack]];
      this.time = json[SampleSchema.Time];
      this.responsiveness = json[SampleSchema.Responsiveness];
      this.rss = json[SampleSchema.RSS];
      this.uss = json[SampleSchema.USS];
      this.frame = thread.frames[json[SampleSchema.FrameNumber]];
      this.power = json[SampleSchema.Power];
    }
  }

  export class GlobalMarker {
    end: number;
    endStack: any;
    name: string
    stack: any
    start: number;
    constructor(json: any) {
      this.name = json.name;
      this.start = json.start;
      this.end = json.end;
      this.endStack = json.endStack;
      this.stack = json.stack;
    }
  }

  export class Marker {
    name: string;
    time: number;
    data: any;
    constructor(thread: Thread, json: any) {
      this.name = thread.getString(json[MarkerSchema.Name]);
      this.time = json[MarkerSchema.Time];
      this.data = json[MarkerSchema.Data];
    }
  }

  export class SampleCounter {
    counts: Int32Array = new Int32Array(4);
    constructor(public id: string, public original: string) {
      // ...
    }
    count(sample: Sample) {
      this.counts[sample.stack.frame.implementation] ++;
    }
    getAllCounts(): number {
      var s = 0;
      var counts = this.counts;
      for (var i = 0; i < counts.length; i++) {
        s += counts[i];
      }
      return s;
    }
    toString() {
      //return ['Interpreter', 'Baseline', 'Ion', 'Native'].map((x, i) => {
      //  return x + ": " + this.counts[i];
      //}).join(", ");
      //return ['I', 'B', 'X', 'N'].map((x, i) => {
      //  return x + " " + this.counts[i];
      //}).join(" ");
    }
  }

  export class SampleGroup {
    samples: Sample [] = [];
    constructor(public id: string, public original: string) {
      // ...
    }
    count(sample: Sample) {
      this.samples.push(sample);
    }
  }

  export class Thread {

    public frames: Frame [];
    public stacks: Stack [];
    public samples: Sample [];
    public markers: Marker [];

    get startTime() {
      var minTime = this.samples[0].time;
      if (this.markers.length > 0) {
        minTime = Math.min(minTime, this.markers[0].time);
      }
      return minTime;
    }

    get endTime() {
      var maxTime = this.samples[this.samples.length - 1].time;
      if (this.markers.length > 0) {
        maxTime = Math.max(maxTime, this.markers[0].time);
      }
      return maxTime;
    }

    get file(): File {
      return this._file;
    }

    constructor(private _file: File, private _json: JSON.Thread) {
      this._load();
    }

    getString(i: number | any): string {
      if (typeof i === "number") {
        assert(i >= 0 && i < this._json.stringTable.length);
        return this._json.stringTable[i];
      }
      return null;
    }

    private _load() {
      // Load Frames
      checkFrameSchema(this._json.frameTable);
      this.frames = this._json.frameTable.data.map(x => x ? new Frame(this, x) : null);

      // Load Stacks
      checkStackSchema(this._json.stackTable);
      var stacks = this._json.stackTable.data;
      this.stacks = new Array(stacks.length);
      for (var i = 0; i < stacks.length; i++) {
        var frameId = stacks[i][StackSchema.Frame];
        var prefixId = stacks[i][StackSchema.Prefix];
        var prefix = typeof prefixId === "number" ? this.stacks[prefixId] : null;
        this.stacks[i] = new Stack(prefix, this.frames[frameId]);
      }

      // Load Samples
      checkSampleSchema(this._json.samples);
      this.samples = this._json.samples.data.map(x => x ? new Sample(this, x) : null);

      // Load Markers, TODO: Bad time info.
      // checkMarkerSchema(this._json.markers);
      // this.markers = this._json.markers.data.map(x => x ? new Marker(this, x) : null);
      this.markers = [];
    }

    sampleIndexByTime(time: number): number {
      var s = this.samples;
      var c = 0;
      var d = Math.abs(time - s[c].time);
      for (var i = 1; i < s.length; i++) {
        var x = s[i];
        if (Math.abs(time - x.time) < d) {
          c = i;
          d = Math.abs(time - x.time);
        } else {
          break;
        }
      }
      return c;
    }

    public countSamples(start: number, end: number): SampleCounter [] {
      var s = this.sampleIndexByTime(start);
      var e = this.sampleIndexByTime(end);
      var samples = this.samples;
      var map = Object.create(null);
      var counters = [];
      for (var i = s; i < e; i++) {
        var sample = samples[i];
        var functionId = sample.stack.frame.location.functionName + ":" + sample.stack.frame.location.line;
        var counter = map[functionId];
        if (!counter) {
          counter = map[functionId] = new SampleCounter(functionId, sample.stack.frame.location.original);
          counters.push(counter);
        }
        counter.count(sample);
      }
      counters = counters.sort(function (a: SampleCounter, b: SampleCounter) {
        return b.getAllCounts() - a.getAllCounts();
      });
      return counters;
    }

    public groupSamplesByFunction(start: number, end: number): SampleGroup [] {
      var s = this.sampleIndexByTime(start);
      var e = this.sampleIndexByTime(end);
      var samples = this.samples;
      var map = Object.create(null);
      var groups = [];
      for (var i = s; i < e; i++) {
        var sample = samples[i];
        var id = sample.stack.frame.location.functionName + ":" + sample.stack.frame.location.line;
        var group = map[id];
        if (!group) {
          group = map[id] = new SampleGroup(id, sample.stack.frame.location.original);
          groups.push(group);
        }
        group.count(sample);
      }
      groups = groups.sort(function (a: SampleGroup, b: SampleGroup) {
        return b.samples.length - a.samples.length;
      });
      return groups;
    }

    public groupSamplesByImplementation(start: number, end: number): SampleGroup [] {
      var s = this.sampleIndexByTime(start);
      var e = this.sampleIndexByTime(end);
      var samples = this.samples;
      var map = Object.create(null);
      var groups = [];
      for (var i = s; i < e; i++) {
        var sample = samples[i];
        var id = sample.stack.frame.implementation;
        var group = map[id];
        if (!group) {
          group = map[id] = new SampleGroup(id, Implementation[id]);
          groups.push(group);
        }
        group.count(sample);
      }
      groups = groups.sort(function (a: SampleGroup, b: SampleGroup) {
        return b.samples.length - a.samples.length;
      });
      return groups;
    }
  }

  export class File {
    public threads: Thread [];
    public markers: GlobalMarker [];
    get json(): JSON.File {
      return this._json;
    }
    get startTime() {
      var min = Number.MAX_VALUE;
      this.threads.forEach(thread => {
        min = Math.min(min, thread.startTime);
      });
      if (this.markers.length) {
        min = Math.min(min, this.markers[0].start);
      }
      return min;
    }
    get endTime() {
      var max = Number.MIN_VALUE;
      this.threads.forEach(thread => {
        max = Math.max(max, thread.endTime);
      });
      if (this.markers.length) {
        max = Math.max(this.markers[this.markers.length - 1].end);
      }
      return max;
    }
    constructor(private _json: JSON.File) {
      this._load();
    }
    private _load() {
      this.threads = this._json.profile.threads.map(x => new Thread(this, x));
      this.markers = this._json.markers.map(x => new GlobalMarker(x));
    }
  }
}
