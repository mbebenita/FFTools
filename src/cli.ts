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

/// <reference path='../build/lib.d.ts' />
/// <reference path="../typings/tsd.d.ts" />

var argv = require('minimist')(process.argv.slice(2));


var vm = require('vm');
var fs = require('fs');
var Table = require('cli-table');

function load(path: string) {
  var code = fs.readFileSync(path).toString();
  vm.runInThisContext(code);
}

load("build/lib.js");

argv._.forEach(path => {
  console.info("Profile: " + path);
  var json = JSON.parse(fs.readFileSync(path).toString());
  var file = new Tools.Profiler.File(json);
  file.threads.forEach((thread, i) => {
    console.info("Thread: " + i);
    var counts = thread.countSamples(thread.startTime, thread.endTime);
    var columns = (<any>process.stdout).columns;
    var table = new Table({
      head: ['Function', 'Int', 'Bsl', 'Ion', 'Nat'], colWidths: [columns - 5 * 8, 8, 8, 8, 8], colAligns: ["left", "right", "right", "right", "right"],
    });
    counts.forEach(count => {
      var cols = [count.id];
      for (var i = 0; i < count.counts.length; i++) {
        cols.push(String(count.counts[i]));
      }
      table.push(cols);
    });
    console.log(table.toString());

    thread.samples.forEach(sample => {
      console.log(sample);
    });
    thread.markers.forEach(marker => {
      console.log(marker);
    });
  });
});



