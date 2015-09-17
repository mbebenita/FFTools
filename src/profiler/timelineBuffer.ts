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

  export interface TimelineItemKind {
    id: number;
    name: string;
    bgColor: string;
    textColor: string;
    visible: boolean;
  }

  /**
   * Records enter / leave events in two circular buffers.
   * The goal here is to be able to handle large amounts of data.
   */
  export class TimelineBuffer {

    static ENTER = 0 << 31;
    static LEAVE = 1 << 31;

    static MAX_KINDID = 0xffff;
    static MAX_DATAID = 0x7fff;

    private _depth: number;
    private _data: any [];
    private _kinds: TimelineItemKind [];
    private _kindNameMap: Map<TimelineItemKind>;
    private _marks: CircularBuffer;
    private _times: CircularBuffer;
    private _stack: number [];
    private _startTime: number;

    public name: string;

    constructor(name: string = "", startTime?: number) {
      this.name = name || "";
      this._startTime = isNullOrUndefined(startTime) ? jsGlobal.START_TIME : startTime;
    }

    getKind(kind: number): TimelineItemKind {
      return this._kinds[kind];
    }

    get kinds(): TimelineItemKind [] {
      return this._kinds.concat();
    }

    get depth(): number {
      return this._depth;
    }

    private _initialize() {
      this._depth = 0;
      this._stack = [];
      this._data = [];
      this._kinds = [];
      this._kindNameMap = Object.create(null);
      this._marks = new CircularBuffer(Int32Array, 20);
      this._times = new CircularBuffer(Float64Array, 20);
    }

    private _getKindId(name: string):number {
      var kindId = TimelineBuffer.MAX_KINDID;
      if (this._kindNameMap[name] === undefined) {
        kindId = this._kinds.length;
        if (kindId < TimelineBuffer.MAX_KINDID) {
          var kind: TimelineItemKind = <TimelineItemKind>{
            id: kindId,
            name: name,
            visible: true
          };
          this._kinds.push(kind);
          this._kindNameMap[name] = kind;
        } else {
          kindId = TimelineBuffer.MAX_KINDID;
        }
      } else {
        kindId = this._kindNameMap[name].id;
      }
      return kindId;
    }

    private _getMark(type: number, kindId: number, data?: any): number {
      var dataId = TimelineBuffer.MAX_DATAID;
      if (!isNullOrUndefined(data) && kindId !== TimelineBuffer.MAX_KINDID) {
        dataId = this._data.length;
        if (dataId < TimelineBuffer.MAX_DATAID) {
          this._data.push(data);
        } else {
          dataId = TimelineBuffer.MAX_DATAID;
        }
      }
      return type | (dataId << 16) | kindId;
    }

    enter(name: string, data?: any, time?: number) {
      time = (isNullOrUndefined(time) ? performance.now() : time) - this._startTime;
      if (!this._marks) {
        this._initialize();
      }
      this._depth++;
      var kindId = this._getKindId(name);
      this._marks.write(this._getMark(TimelineBuffer.ENTER, kindId, data));
      this._times.write(time);
      this._stack.push(kindId);
    }

    leave(name?: string, data?: any, time?: number) {
      time = (isNullOrUndefined(time) ? performance.now() : time) - this._startTime;
      var kindId = this._stack.pop();
      if (name) {
        kindId = this._getKindId(name);
      }
      this._marks.write(this._getMark(TimelineBuffer.LEAVE, kindId, data));
      this._times.write(time);
      this._depth--;
    }

    count(name: string, value: number, data?: any) {
      // Not Implemented
    }

    /**
     * Constructs an easier to work with TimelineFrame data structure. 
     */
    createSnapshot(count: number = Number.MAX_VALUE): TimelineBufferSnapshot {
      if (!this._marks) {
        return null;
      }
      var times = this._times;
      var kinds = this._kinds;
      var datastore = this._data;
      var snapshot = new TimelineBufferSnapshot(this.name);
      var stack: TimelineFrame [] = [snapshot];
      var topLevelFrameCount = 0;

      if (!this._marks) {
        this._initialize();
      }

      this._marks.forEachInReverse(function (mark, i) {
        var dataId = (mark >>> 16) & TimelineBuffer.MAX_DATAID;
        var data = datastore[dataId];
        var kindId = mark & TimelineBuffer.MAX_KINDID;
        var kind = kinds[kindId];
        if (isNullOrUndefined(kind) || kind.visible) {
          var action = mark & 0x80000000;
          var time = times.get(i);
          var stackLength = stack.length;
          if (action === TimelineBuffer.LEAVE) {
            if (stackLength === 1) {
              topLevelFrameCount++;
              if (topLevelFrameCount > count) {
                return true;
              }
            }
            stack.push(new TimelineFrame(stack[stackLength - 1], kind, null, data, NaN, time));
          } else if (action === TimelineBuffer.ENTER) {
            var node = stack.pop();
            var top = stack[stack.length - 1];
            if (top) {
              if (!top.children) {
                top.children = [node];
              } else {
                top.children.unshift(node);
              }
              var currentDepth = stack.length;
              node.depth = currentDepth;
              node.startData = data;
              node.startTime = time;
              while (node) {
                if (node.maxDepth < currentDepth) {
                  node.maxDepth = currentDepth;
                  node = node.parent;
                } else {
                  break;
                }
              }
            } else {
              return true;
            }
          }
        }
      });
      if (snapshot.children && snapshot.children.length) {
        snapshot.startTime = snapshot.children[0].startTime;
        snapshot.endTime = snapshot.children[snapshot.children.length - 1].endTime;
      }
      return snapshot;
    }

    reset(startTime?: number) {
      this._startTime = isNullOrUndefined(startTime) ? performance.now() : startTime;
      if (!this._marks) {
        this._initialize();
        return;
      }
      this._depth = 0;
      this._data = [];
      this._marks.reset();
      this._times.reset();
    }

    static getStack(thread: JSON.Thread, stackId: number) {
      var stack = [];
      var stackTable = thread.stackTable;
      var frameSlot = stackTable.schema.frame;
      var prefixSlot = stackTable.schema.prefix;
      do {
        var frame = stackTable.data[stackId];
        stack.unshift(frame);
        stackId = frame[prefixSlot];
      } while (stackId);
      return stack;
    }

    static getFrameField(thread: JSON.Thread, frameId: number, field: string) {
      var k = thread.frameTable.data[frameId][thread.frameTable.schema[field]];
      return thread.stringTable[k];
    }

    static FromFirefoxProfile(profile: JSON.File, name?: string) {
      var thread = profile.profile.threads[0];
      var data = thread.samples.data;
      var schema = thread.samples.schema;
      var frameSlot = thread.stackTable.schema.frame;

      var timeSlot = schema.time;
      var stackSlot = schema.stack;
      var buffer = new TimelineBuffer(name, data[0][timeSlot]);
      var currentStack = [];
      var sample;
      for (var i = 0; i < data.length; i++) {
        sample = data[i];
        var time = sample[timeSlot];
        var stack = TimelineBuffer.getStack(thread, sample[stackSlot]);
        var j = 0;
        var minStackLen = Math.min(stack.length, currentStack.length);
        while (j < minStackLen && stack[j][frameSlot] === currentStack[j][frameSlot]) {
          j++;
        }
        var leaveCount = currentStack.length - j;
        for (var k = 0; k < leaveCount; k++) {
          sample = currentStack.pop();
          buffer.leave("" + TimelineBuffer.getFrameField(thread, sample[frameSlot], "location"), null, time);
        }
        while (j < stack.length) {
          sample = stack[j++];
          buffer.enter("" + TimelineBuffer.getFrameField(thread, sample[frameSlot], "location"), null, time);
        }
        currentStack = stack;
      }
      while (sample = currentStack.pop()) {
        buffer.leave("" + TimelineBuffer.getFrameField(thread, sample[frameSlot], "location"), null, time);
      }
      return buffer;
    }

    static FromChromeProfile(profile, name?: string) {
      var timestamps = profile.timestamps;
      var samples = profile.samples;
      var buffer = new TimelineBuffer(name, timestamps[0] / 1000);
      var currentStack = [];
      var idMap = {};
      var sample;
      TimelineBuffer._resolveIds(profile.head, idMap);
      for (var i = 0; i < timestamps.length; i++) {
        var time = timestamps[i] / 1000;
        var stack = [];
        sample = idMap[samples[i]];
        while (sample) {
          stack.unshift(sample);
          sample = sample.parent;
        }
        var j = 0;
        var minStackLen = Math.min(stack.length, currentStack.length);
        while (j < minStackLen && stack[j] === currentStack[j]) {
          j++;
        }
        var leaveCount = currentStack.length - j;
        for (var k = 0; k < leaveCount; k++) {
          sample = currentStack.pop();
          buffer.leave(sample.functionName, null, time);
        }
        while (j < stack.length) {
          sample = stack[j++];
          buffer.enter(sample.functionName, null, time);
        }
        currentStack = stack;
      }
      while (sample = currentStack.pop()) {
        buffer.leave(sample.functionName, null, time);
      }
      return buffer;
    }

    private static _resolveIds(parent, idMap) {
      idMap[parent.id] = parent;
      if (parent.children) {
        for (var i = 0; i < parent.children.length; i++) {
          parent.children[i].parent = parent;
          TimelineBuffer._resolveIds(parent.children[i], idMap);
        }
      }
    }
  }

}
