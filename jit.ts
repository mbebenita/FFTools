///<reference path='./node.d.ts'/>

module JITCoach {
  enum Alignment {
    Left = 1, Right = 2
  }
  
  function padAlignment(s: string, length: number, c: string, alignment: Alignment) {
    if (alignment === Alignment.Left) {
      return padLeft(s, length, c);
    }
    return padRight(s, length, c);
  }

  class Column {
    constructor(public width: number) {

    }
  }

  class Cell {
    public padLeft = 0;
    public padRight = 1;
    public columnSpan = 0;
    constructor(public value: string, public alignment?: Alignment, columnSpan: number = 1) {
      if (alignment === undefined) {
        alignment = Alignment.Left;
        if (!isNaN(+value)) {
          alignment = Alignment.Right;
        }
      }
      this.columnSpan = columnSpan;
    }
    toString(column: Column) {
      return stringDup(' ', this.padLeft) + padAlignment(String(this.value), column.width - this.padLeft - this.padRight, ' ', this.alignment) + stringDup(' ', this.padRight);
    }
    get width() {
      return String(this.value).length + this.padLeft + this.padRight;
    }
  }

  class Row {
    private cells: Cell [] = [];
    constructor(cells: Cell []) {
      this.cells = cells;
    }
    stretch(columns: Column []) {
      var j = 0;
      for (var i = 0; i < this.cells.length; i++) {
        var cell = this.cells[i];
        var cellWidth = cell.width;
        // Create new column.
        var column = columns[j] || (columns[j] = new Column(0));
        if (cell.columnSpan === 1) {
          column.width = Math.max(column.width, cellWidth);
        } else {
          var spannedWidth = 0;
          var k = 0;
          var w = cell.width;
          var s = cell.columnSpan;
          for (var l = j; l < j + s; l++) {
            var c = columns[l] || (columns[l] = new Column(0));
            spannedWidth += c.width;
          }
          while (spannedWidth < w) {
            var l = j + (k++ % s);
            var c = columns[l] || (columns[l] = new Column(0));
            c.width ++;
            spannedWidth ++;
          }
        }
        j++;
      }
    }
    toString(columns: Column []) {
      var s = "";
      this.cells.forEach(function (cell, i) {
        s += cell.toString(columns[i])
      });
      return s;
    }
  }

  class Table {
    private rows: Row [] = [];
    private columns: Column [];

    addRow(... values: any []) {
      if (values.length === 1 && values[0] instanceof Row) {
        this.rows.push(values[0]);
        return;
      }
      this.rows.push(new Row(values.map(function (x) {
        if (x instanceof Cell) {
          return x;
        }
        return new Cell(String(x));
      })));
    }
    toString() {
      var columns = this.columns = [];
      this.rows.forEach(function (row) {
        row.stretch(columns);
      });
      return this.rows.map(x => x.toString(columns)).join("\n");
    }
  }

  interface Type {
    keyedBy: string;
    name: string;
    location: string;
    line: number
  }
  interface OptimizationType {
    types: Type [];
    site: string;
    mirType: string;
  }
  interface Attempt {
    strategy: string;
    outcome: string;
  }
  interface RawOptimizationSite {
    types: OptimizationType [];
    attempts: Attempt [];
    samples: number;
    location: string;
    line: number;
    column: number;
  }
  interface Frame {
    location: string;
    line: number;
    category: number;
    optsIndex?: number;
    implementation: string;
  }
  interface Sample {
    frames: Frame [];
    responsiveness: number;
    time: number;
  }
  interface Thread {
    name: string;
    tid: number;
    samples: Sample [];
    optimizations: RawOptimizationSite [];
    markers: any []
  }
  interface Allocations {
    sites: number [];
    timestamps: number [];
    frames: any [];
    counts: number [];
  }
  interface ProfileFile {
    label: string;
    duration: number;
    markers: any [];
    frames: any [];
    memory: any [];
    ticks: any [];
    allocations: Allocations ;
    profile: {
      libs: any;
      meta: any;
      threads: Thread [];
    };
    fileType: string;
    version: number;
  }

  var fs = require('fs');
  var ansi = require('ansi'), cursor = ansi(process.stdout);
  var argv = require('minimist')(process.argv.slice(2));
  // var clear = require('clear');

  /**
   * Dumps entire file without ellipsis.
   */
  var dumpAll = argv.f;

  /**
   * Don't dump any optimization site that has fewer than this number of samples.
   */
  var dumpSampleThreshold = argv.t | 0;
  var showGeckoPlatformData = argv.g;

  var request = require("request");

  // An outcome of an OptimizationAttempt that is considered successful.
  var SUCCESSFUL_OUTCOMES = [
    "GenericSuccess", "Inlined", "DOM", "Monomorphic", "Polymorphic"
  ];

  function isSuccessfulOutcome(outcome: string) {
    return !!~SUCCESSFUL_OUTCOMES.indexOf(outcome);
  }


  function loadProfile(fileName: string): ProfileFile {
    var profile = JSON.parse(fs.readFileSync(fileName, 'utf8'));
    return profile;
  }

  function scanProfile(profile: ProfileFile) {
    var threads = profile.profile.threads;
    for (var i = 0; i < threads.length; i++) {
      var thread = threads[i];
      var samples = thread.samples;
      console.log("Loading thread: " + i + ", " + samples.length + " samples.");
      for (var j = 0; j < samples.length; j++) {
        var sample = samples[j];
        var frames = sample.frames;
        for (var k = 0; k < frames.length; k++) {
          var frame = frames[k];
          if (frame.optsIndex !== undefined) {
            var optimization = thread.optimizations[frame.optsIndex];
            optimization.location = frame.location;
            if (optimization.samples === undefined) {
              optimization.samples = 0;
            }
            optimization.samples++;
          }
        }
      }
    }
  }

  function dumpProfile(profile: ProfileFile) {
    dumpFunctions(profile.profile.threads[0]);
    dumpOptimizationSites(profile.profile.threads[0].optimizations);
  }

  function countersToString(counter: any) {
    return padLeft(String(counter.interpreter), 5, ' ') + " " +
           padLeft(String(counter.baseline), 5, ' ') + " " +
           padLeft(String(counter.ion), 5, ' ')
  }

  var CHROME_SCHEMES = ["chrome://", "resource://", "jar:file://"];
  var CONTENT_SCHEMES = ["http://", "https://", "file://", "app://"];

  function isContent(frame: Frame) {
    // Only C++ stack frames have associated category information.
    if (frame.category) {
      return false;
    }
    for (var i = 0; i < CONTENT_SCHEMES.length; i++) {
      var scheme = CONTENT_SCHEMES[i];
      if (frame.location.indexOf(scheme) >= 0) {
        return true;
      }
    }
    return false;
    //       !CHROME_SCHEMES.find(e => frame.location.contains(e)) &&
  }

  class FunctionTierCounters {
    interpreter = 0;
    baseline = 0;
    ion = 0;

    get all() {
      return this.interpreter + this.baseline + this.ion;
    }

    get compiled() {
      return this.baseline + this.ion;
    }
  }

  class FlatFunctionProfile {
    constructor(public location: string,
                public samples: Sample [] = [],
                public inclusive: FunctionTierCounters = new FunctionTierCounters(),
                public exclusive: FunctionTierCounters = new FunctionTierCounters()) {
      // ...
    }
  }

  function dumpFunctions(thread: Thread) {
    var flatFunctionProfileSet = {};
    var samples = thread.samples;
    var sampleCount = 0;
    for (var j = 0; j < samples.length; j++) {
      var sample = samples[j];
      var frames = sample.frames;
      for (var k = 0; k < frames.length; k++) {
        var frame = frames[k];
        if (isContent(frame) || showGeckoPlatformData) {
          sampleCount ++;
          var functionProfile = flatFunctionProfileSet[frame.location] || (flatFunctionProfileSet[frame.location] = new FlatFunctionProfile(frame.location));
          functionProfile.inclusive[frame.implementation ? frame.implementation : "interpreter"]++;
          if (k === frames.length - 1) {
            functionProfile.exclusive[frame.implementation ? frame.implementation : "interpreter"]++;
          }
          functionProfile.samples.push(sample);
        }
      }
    }
    // Sort function profiles.
    var flatFunctionProfileList = [];
    for (var key in flatFunctionProfileSet) {
      flatFunctionProfileList.push(flatFunctionProfileSet[key]);
    }
    flatFunctionProfileList.sort(function (a, b) {
      return b.inclusive.all - a.inclusive.all;
    });

    var table = new Table();
    table.addRow('INT', 'BSL', 'ION', 'INT', 'BSL', 'ION', '   ', '    ', '   ', '');
    table.addRow('INC', 'INC', 'INC', 'EXC', 'EXC', 'EXC', 'INC', '%INC', 'EXC', 'Function');
    table.addRow('---', '---', '---', '---', '---', '---', '---', '----', '---', '--------');
    for (var i = 0; i < flatFunctionProfileList.length; i++) {
      var counter = flatFunctionProfileList[i];
      var inclusiveSamples = counter.inclusive.all;
      var exclusiveSamples = counter.exclusive.all;
      table.addRow(
        counter.inclusive.interpreter, counter.inclusive.baseline, counter.inclusive.ion,
        counter.exclusive.interpreter, counter.exclusive.baseline, counter.exclusive.ion,
        inclusiveSamples,
        ((inclusiveSamples / sampleCount) * 100).toFixed(2),
        exclusiveSamples,
        new Cell(stringShrink(counter.location, (<any>process.stdout).columns)));
        // table.addRow(new Row([new Cell('---------------------------------------------------------', Alignment.Left, 10)]));
      // table.addRow(new Row([new Cell("ABC", i % 2)]));
    }

    var tableRows = table.toString().split("\n");
    console.log(tableRows[0]);
    console.log(tableRows[1]);
    console.log(tableRows[2]);
    for (var i = 0; i < flatFunctionProfileList.length; i++) {
      console.log(tableRows[i + 3]);
      dumpFlatFunctionProfileASCII(flatFunctionProfileList[i]);
    }

    // dumpFlatFunctionProfilePNG(flatFunctionProfileList[0]);
    // // console.log(table.toString());
    // console.log(table.toString());
    // console.dir(thread, {depth: 0});
  }

  function dumpFlatFunctionProfileASCII(flatFunctionProfile: FlatFunctionProfile) {
    var samples = flatFunctionProfile.samples;
    var a = samples[0];
    var b = samples[samples.length - 1];
    var s = a.time;
    var e = b.time - s;
    var buckets = new Array((<any>process.stdout).columns);
    for (var i = 0; i < buckets.length; i++) {
      buckets[i] = [];
    }

    // Put samples in buckets.
    for (var i = 0; i < samples.length; i++) {
      var sample = samples[i];
      var bucketIndex = Math.min(buckets.length - 1,
                                 ((sample.time - s) / e) * buckets.length | 0);
      buckets[bucketIndex].push(sample);
    }

    dumpBuckets(flatFunctionProfile, buckets, 8);
  }

  function countTiersInSample(sample: Sample, location: string, counter: FunctionTierCounters) {
    var frames = sample.frames;
    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i];
      if (frame.location === location) {
        counter[frame.implementation ? frame.implementation : "interpreter"]++;
      }
    }
  }

  function dumpBuckets(flatFunctionProfile: FlatFunctionProfile, buckets: Sample [][], height: number) {
    var maxValue = 0;
    var bucketCounters = new Array(buckets.length);
    for (var i = 0; i < buckets.length; i++) {
      var samples = buckets[i];
      maxValue = Math.max(maxValue, samples.length);

      bucketCounters[i] = new FunctionTierCounters();
      for (var j = 0; j < samples.length; j++) {
        var sample = samples[j];
        countTiersInSample(sample, flatFunctionProfile.location, bucketCounters[i]);
      }
    }
    height = Math.min(height, maxValue);
    for (var i = 0; i < height; i++) {
      var s = "";
      for (var j = 0; j < buckets.length; j++) {
        var h = height - ((buckets[j].length / maxValue) * height) | 0;
        if (h < i) {
          if (bucketCounters[j].interpreter) {
            s += "\033[38;5;196m";
          } else if (bucketCounters[j].baseline > bucketCounters[j].ion) {
            s += "\033[38;5;68m";
          } else {
            s += "\033[38;5;46m";
          }
          s += "×";
          s += "\033[m";
        } else {
          s += " ";
        }
      }
      console.log(s);
    }
    console.log(stringDup('=', buckets.length));
    // console.dir(bucketCounters);
  }

  function getNameFromLocation(location: string) {
    return location.substr(0, location.indexOf(" "));
  }

  function getURLFromLocation(location: string) {
    var i = location.indexOf("(");
    var j = location.lastIndexOf(":");
    var url = location.substring(i + 1, j);
    if (url.indexOf("file://") === 0) {
      return url;
    } else if (url.indexOf("http://") === 0) {
      return url;
    }
    // console.log("Cannot parse location: " + url);
    return null;
  }

  function dumpOptimizationSites(optimizationSites: RawOptimizationSite []) {
    var files = {};
    for (var i = 0; i < optimizationSites.length; i++) {
      var site = optimizationSites[i];
      var fileURL = getURLFromLocation(site.location);
      if (fileURL && site.samples >= dumpSampleThreshold) {
        if (!files[fileURL]) {
          files[fileURL] = [];
        }
        if (files[fileURL]) {
          files[fileURL].push(site);
        }
      }
    }
    for (var key in files) {
      // Sort sites by line number.
      files[key].sort(function (a, b) {
        return a.line - b.line;
      });
      dumpOptimizationSitesForFile(key, files[key]);
    }
  }

  function siteInRange(siteMap: any, i, range: number = 5) {
    for (var j = i - range; j < i + range; j++) {
      if (siteMap[j]) {
        return true;
      }
    }
    return false;
  }

  function dumpOptimizationSitesForFile(fileURL: string, sites: RawOptimizationSite []) {
    request(fileURL, function(error, response, body) {
      var source: string [] = body.split("\n");

      var maxLineNumber = source.length;
      var maxSampleNumber = 0;
      var lineSites = [];
      var totalSamples = 0;
      for (var i = 0; i < sites.length; i++) {
        var site = sites[i];
        if (!lineSites[site.line]) {
          lineSites[site.line] = []
        }
        lineSites[site.line].push(site);
        maxSampleNumber = Math.max(maxSampleNumber, site.samples);
        totalSamples += site.samples;
      }
      console.log("");
      console.log("File: " + fileURL + ", " + sites.length + " optimization site(s) with " + totalSamples + " sample(s).");
      console.log("");
      var gutterWidth = String(Math.max(maxLineNumber, maxSampleNumber)).length;
      var inRange = false;
      for (var i = 0; i < source.length; i++) {
        var sourceLine = source[i];
        if (dumpAll || siteInRange(lineSites, i)) {
          inRange = true;
          console.log(padLeft(String(i), gutterWidth) + ": " + sourceLine);
        } else if (inRange) {
          console.log(padLeft("", gutterWidth) + ": " + "...");
          inRange = false;
        }
        if (lineSites[i + 1]) {
          dumpLineOptimizationSite(gutterWidth, sourceLine, lineSites[i + 1]);
        }
      }
    });
  }

  function dumpLineOptimizationSite(gutterWidth: number, sourceLine: string, sites: RawOptimizationSite []) {
    for (var j = 0; j < sites.length; j++) {
      var divider = j === 0 ? "^" : "-";
      var site = sites[j];
      var attempts = site.attempts;
      cursor.horizontalAbsolute(0);
      var lastOutcomeIsSuccessful = isSuccessfulOutcome(attempts[attempts.length - 1].outcome);
      if (lastOutcomeIsSuccessful) {
        cursor.hex('#7FFF00');
        cursor.write(padLeft(String(site.samples), gutterWidth) + ":<" + maskString(sourceLine, divider) + "\n");
      } else {
        cursor.hex('#880000');
        cursor.write(padLeft(String(site.samples), gutterWidth) + ":>" + maskString(sourceLine, divider) + "\n");
      }
      for (var i = 0; i < attempts.length; i++) {
        if (isSuccessfulOutcome(attempts[i].outcome)) {
          cursor.hex('#7FFF00');
        } else if (lastOutcomeIsSuccessful) {
          cursor.hex('#FFFF00');
        } else {
          cursor.hex('#880000');
        }
        var attempt = attempts[i];
        cursor.horizontalAbsolute(4 + gutterWidth + stringStart(sourceLine));
        cursor.write("• " + attempt.strategy + " -> " + attempt.outcome + "\n");
      }
      //var types = site.types;
      //for (var i = 0; i < types.length; i++) {
      //  var type = types[i];
      //  cursor.horizontalAbsolute(4 + gutterWidth + stringStart(sourceLine));
      //  cursor.write("• " + type.mirType + "\n");
      //}
      cursor.reset();
    }
  }

  var profiles = argv._.map(function (fileName) {
    var profile = loadProfile(fileName);
    scanProfile(profile);
    return profile;
  });

  dumpProfile(profiles[0]);

  function padLeft(s: string, n: number, c = ' '): string {
    while (n > s.length) {
      s = c + s;
    }
    return s;
  }

  function padRight(s: string, n: number, c = ' '): string {
    while (n > s.length) {
      s = s + c;
    }
    return s;
  }

  function maskString(s: string, c: string, single: boolean = true) {
    var chars = s.split("");
    if (single) {
      var j = stringEnd(s);
      for (var i = stringStart(s); i <= j; i++) {
        chars[i] = c;
      }
      return chars.join("");
    }
    var r = "";
    for (var i = 0; i < s.length; i++) {
      if (s[i] !== ' ') {
        r += c;
      } else {
        r += s[i];
      }
    }
    return r;
  }

  function stringStart(s: string) {
    var i = 0;
    while (i < s.length && s[i] === ' ') {
      i++;
    }
    return i;
  }

  function stringEnd(s: string) {
    var i = s.length - 1;
    while (i >= 0 && s[i] === ' ') {
      i--;
    }
    return i;
  }

  function stringClamp(s: string, length: number) {
    if (s.length <= length) {
      return s;
    }
    return s.substr(0, length - 4) + " ...";
  }

  function stringShrink(s: string, length: number) {
    s = s.replace("http://localhost:8000", "...:8000");
    return stringClamp(s, length);
  }

  function stringDup(c: string, n: number) {
    if (n <= 0) {
      return "";
    }
    var s = "";
    while (n--) {
      s += c;
    }
    return s;
  }
  //
  //function processFile(fileName: string) {
  //  var source: string [] = fs.readFileSync(fileName, 'utf8').split("\n");
  //  var lineNumberWidth = String(source.length).length;
  //  var lineOffset = lineNumberWidth + 2;
  //  for (var i = 0; i < source.length; i++) {
  //    var line = source[i];
  //    if (i === 17) {
  //      cursor.hex('#660000');
  //      // console.log(padLeft(dup('█', String(i).length + 1), lineNumberWidth + 1) + " " + line);
  //      // cursor.horizontalAbsolute(5);
  //      // cursor.write('█\n');
  //      cursor.reset();
  //    }
  //    console.log(padLeft(String(i), lineNumberWidth) + ": " + line);
  //  }
  //}
}

