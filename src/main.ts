module Profiler {

  function getJSON(url: string, callback: any) {
    var req = new XMLHttpRequest();
    req.open("get", url, true);
    req.responseType = "json";
    req.onreadystatechange = function () {
      if (this.readyState == 4) {
        var json = req.response;
        if (typeof json === "string") {
          try {
            json = JSON.parse(json);
          }
          catch (e) {
            callback(null);
          }
        }
        callback(json);
      }
    };
    req.send(null);
  }

  var elProfilerPanel = document.getElementById("profilePanel");
  var elTablePanel = document.getElementById("tablePanel");

  var controller = new Tools.Profiler.Controller(elProfilerPanel);

  getJSON("profile.json", function (json: Tools.Profiler.JSON.File) {
    var buffer = Tools.Profiler.TimelineBuffer.FromFirefoxProfile(json);
    controller.createProfile([buffer]);

    var file = new Tools.Profiler.File(json);
    var tableView = new Tools.Profiler.ProfileTableView(elTablePanel, file);

    //controller._functionCharts[0].setFunction(json, "Node.prototype.visit (http://localhost:8000/build/ts/gfx-base.js:3823)");
    //controller._functionCharts[1].setFunction(json, "Canvas2DRenderer.prototype.visitGroup (http://localhost:8000/build/ts/gfx.js:2082)");
    //controller._functionCharts[2].setFunction(json, "RenderableShape.prototype.render (http://localhost:8000/build/ts/gfx-base.js:5061)");
    //controller._functionCharts[3].setFunction(json, "Canvas2DRenderer.prototype.visitStage (http://localhost:8000/build/ts/gfx.js:2177)");
    setInterval(function () {
      var s = (<any>controller)._activeProfile._windowStart;
      var e = (<any>controller)._activeProfile._windowEnd;

      tableView.setWindow(s, e);
      //var elRow: HTMLTableRowElement = <HTMLTableRowElement>elTreeTable.insertRow(2);
      //var elCell0 = elRow.insertCell(0);
      //var elCell1 = elRow.insertCell(1);
      //elCell0.innerHTML = s;
      //elCell1.innerHTML = e;
      // tableView.
    }, 1000);
  });


  function foo() {
    var canvas = document.createElement("canvas");
    var context = canvas.getContext("2d");
    for (var i = 0; i < 1000000; i++) {
      context.measureText("Hello World");
    }
  }

  foo();
}