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
  import assert = Debug.assert;

  export class ProfileTableRow {
    samples: Sample [] = [];
    constructor(public functionName: string, public xxx: string) {
      // ...
    }
  }

  function makePercentage(a: number, b: number): string {
    return ((a / b) * 100).toFixed(0) + "%";
  }

  export class ProfileTableView {
    private _table: HTMLTableElement;
    private _container: HTMLElement;
    private _file: File;
    private _rows: ProfileTableRow [];
    private _rangeSamples: number;

    private _start: number;
    private _end: number;
    constructor(container: HTMLElement, file: File) {
      this._container = container;
      this._file = file;
      this._rows = [];
      this._table = document.createElement("table");
      this._container.appendChild(this._table);
    }

    public setWindow(start: number, end: number) {
      while (this._table.rows.length) {
        this._table.deleteRow(0);
      }
      this._start = start;
      this._end = end;
      this._rows = [];
      this._createTable();
    }

    private _appendRow(row: ProfileTableRow): HTMLTableRowElement {
      var elRow = <HTMLTableRowElement>this._table.insertRow(this._table.rows.length);
      for (var i = 0; i < 6; i++) {
        var cell = elRow.insertCell();
      }
      var sampleCount = row.samples.length;
      (<any>elRow).cells[0].innerHTML = makePercentage(sampleCount, this._rangeSamples);
      (<any>elRow).cells[1].innerHTML = sampleCount;
      var counts = new Int32Array(4);
      for (var i = 0; i < row.samples.length; i++) {
        counts[row.samples[i].stack.frame.implementation]++;
      }
      (<any>elRow).cells[2].innerHTML = makePercentage(counts[Implementation.Interpreter], sampleCount);
      (<any>elRow).cells[3].innerHTML = makePercentage(counts[Implementation.Baseline], sampleCount);
      (<any>elRow).cells[4].innerHTML = makePercentage(counts[Implementation.Ion], sampleCount);
      for (var i = 0; i < 5; i++) {
        (<any>elRow).cells[i].classList.toggle("percent-column");
      }
      if (sampleCount / this._rangeSamples > 0.01) {
        if (counts[Implementation.Interpreter] / sampleCount > 0.5) {
          (<any>elRow).cells[2].classList.toggle("critical-column");
        }
        if (counts[Implementation.Baseline] / sampleCount > 0.5) {
          (<any>elRow).cells[3].classList.toggle("warning-column");
        }
      }
      if (sampleCount / this._rangeSamples > 0.1 &&
          counts[Implementation.Interpreter] / sampleCount > 0.5) {
          (<any>elRow).classList.toggle("critical-row");
      }
      (<any>elRow).cells[5].innerHTML = row.functionName;
      // (<any>elRow).cells[2].style["padding-left"] = (row.getHeight() * 12) + "px";
      return elRow;
    }

    private _createTable() {
      var table = this._table;
      var rows = this._rows;
      var functionNameRowMap = Object.create(null);

      var thread = this._file.threads[0];
      var s = thread.sampleIndexByTime(this._start);
      var e = thread.sampleIndexByTime(this._end);
      var samples = thread.samples;
      this._rangeSamples = e - s;
      for (var i = s; i < e; i++) {
        var sample = samples[i];
        var functionId = sample.stack.frame.location.functionName + ":" + sample.stack.frame.location.line;
        var row = functionNameRowMap[functionId];
        if (!row) {
          row = functionNameRowMap[functionId] = new ProfileTableRow(functionId, sample.stack.frame.location.original);
          rows.push(row);
        }
        row.samples.push(sample);
      }

      rows = rows.sort(function (a: ProfileTableRow, b: ProfileTableRow) {
        return b.samples.length - a.samples.length;
      });

      var sampleCount = this._file.threads[0].samples.length;

      rows.forEach(x => {
        if ((x.samples.length / sampleCount) > 0.001) {
          this._appendRow(x);
        }
      });

    }
  }
}
