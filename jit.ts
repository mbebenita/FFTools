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
  
  class Cell {
    constructor(public value: string, public alignment?: Alignment) {
      if (alignment === undefined) {
        alignment = Alignment.Left;
        if (!isNaN(+value)) {
          alignment = Alignment.Right;
        }
      }
    }
    toString() {
      return String(this.value);
    }
  }

  class Column {
    constructor(public width: number) {

    }
  }

  class Row {
    private cells: Cell [] = [];
    constructor(cells: Cell []) {
      this.cells = cells;
    }
    stretch(columns: Column []) {
      this.cells.forEach(function (cell, i) {
        var column = columns[i] || (columns[i] = new Column(0));
        column.width = Math.max(column.width, cell.toString().length);
      });
    }
    toString(columns: Column []) {
      var s = "";
      this.cells.forEach(function (cell, i) {
        s += padAlignment(cell.toString(), columns[i].width, ' ', cell.alignment) + " ";
      });
      return s;
    }
  }

  class Table {
    private rows: Row [] = [];
    addRow(... values: any []) {
      this.rows.push(new Row(values.map(function (x) {
        if (x instanceof Cell) {
          return x;
        }
        return new Cell(String(x));
      })));
    }
    toString() {
      var columns = [];
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
    //console.dir(profile.profile.threads[0].samples, {depth: null});
    // console.dir(profile.profile.threads[0].optimizations, {depth: null});
    // console.dir(Object.keys(profile.profile.threads[0]));
    // console.dir(profile.profile.threads[0].optimizations);

    // console.dir(profile.profile.threads[0], {depth: null});

    dumpFunctions(profile.profile.threads[0]);
    dumpOptimizationSites(profile.profile.threads[0].optimizations);

    //console.log(profile.allocations.counts.length);
    //console.log(profile.allocations.frames.length);
    //console.log(profile.allocations.sites.length);
    //console.log(profile.allocations.timestamps.length);
    //console.dir(profile.allocations.frames, {depth: 1});
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

  function dumpFunctions(thread: Thread) {
    var functionCounters = {};
    var samples = thread.samples;
    var sampleCount = 0;
    for (var j = 0; j < samples.length; j++) {
      var sample = samples[j];
      var frames = sample.frames;
      for (var k = 0; k < frames.length; k++) {
        var frame = frames[k];
        if (isContent(frame) || showGeckoPlatformData) {
          sampleCount ++;
          var counter = functionCounters[frame.location] || (functionCounters[frame.location] = {
            location: frame.location,
            call: {
              interpreter: 0,
              baseline: 0,
              ion: 0
            },
            self: {
              interpreter: 0,
              baseline: 0,
              ion: 0
            }
          });
          counter.call[frame.implementation ? frame.implementation : "interpreter"]++;
          if (k === frames.length - 1) {
            counter.self[frame.implementation ? frame.implementation : "interpreter"]++;
          }
        }
      }
    }
    var functionCounterList = [];
    for (var k in functionCounters) {
      functionCounterList.push(functionCounters[k]);
    }
    functionCounterList.sort(function (a, b) {
      return (b.call.interpreter + b.call.baseline + b.call.ion) -
             (a.call.interpreter + a.call.baseline + a.call.ion);
    });

    var table = new Table();
    table.addRow('INT', 'BSL', 'ION', 'INT', 'BSL', 'ION', '   ', '    ', '   ', '');
    table.addRow('ALL', 'ALL', 'ALL', 'SLF', 'SLF', 'SLF', 'ALL', '%ALL', 'SLF', 'Function');
    table.addRow('---', '---', '---', '---', '---', '---', '---', '----', '---', '--------');
    for (var i = 0; i < functionCounterList.length; i++) {
      var counter = functionCounterList[i];
      var callSamples = counter.call.interpreter + counter.call.baseline + counter.call.ion;
      var selfSamples = counter.self.interpreter + counter.self.baseline + counter.self.ion;
      table.addRow(
        counter.call.interpreter, counter.call.baseline, counter.call.ion,
        counter.self.interpreter, counter.self.baseline, counter.self.ion,
        callSamples,
        ((callSamples / sampleCount) * 100).toFixed(2),
        selfSamples,
        new Cell(stringShrink(counter.location, (<any>process.stdout).columns)));
    }

    console.log(table.toString());
    // console.dir(thread, {depth: 0});
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
    while (n >= s.length) {
      s = c + s;
    }
    return s;
  }

  function padRight(s: string, n: number, c = ' '): string {
    while (n >= s.length) {
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

  function dup(c: string, n: number) {
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

