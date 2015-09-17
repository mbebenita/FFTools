
/// <reference path='../references.ts' />
/// <reference path='profile.ts' />
/// <reference path='profileTableView.ts' />
/// <reference path='timelineFrame.ts' />
/// <reference path='timelineBuffer.ts' />
/// <reference path='firefox/data.ts' />
/// <reference path='controller.ts' />
/// <reference path='mouseController.ts' />
/// <reference path='chartBase.ts' />
/// <reference path='flameChart.ts' />
/// <reference path='flameChartOverview.ts' />
/// <reference path='scrubberChart.ts' />
// /// <reference path='functionChart.ts' />

interface MouseWheelEvent extends MouseEvent {
  deltaX: number;
  deltaY: number;
  deltaZ: number;
}
