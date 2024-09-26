/* exported orderOverview, disorderOverview */
import * as Params from 'resource:///org/gnome/shell/misc/params.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';


const WINDOW_PREVIEW_MAXIMUM_SCALE = 0.95;

var injected = {}

/**
 * Makes every window of the same size and orders the 
 * overview by last recent used
 */
export default class OverviewCleanerExtension {
	enable() {
		injected['_createBestLayout'] = Workspace.WorkspaceLayout.prototype._createBestLayout;
		Workspace.WorkspaceLayout.prototype._createBestLayout = _createBestLayout;
	}
	disable() {
		Workspace.WorkspaceLayout.prototype._createBestLayout = injected['_createBestLayout'];
	}
}

function _createBestLayout(area) {
	const [rowSpacing, columnSpacing] =
		this._adjustSpacingAndPadding(this._spacing, this._spacing, null);

	// We look for the largest scale that allows us to fit the
	// largest row/tallest column on the workspace.
	this._layoutStrategy = new UnalignedLayoutStrategy({
		monitor: Main.layoutManager.monitors[this._monitorIndex],
		rowSpacing,
		columnSpacing,
	});

	let lastLayout = null;
	let lastNumColumns = -1;
	let lastScale = 0;
	let lastSpace = 0;

	for (let numRows = 1; ; numRows++) {
		const numColumns = Math.ceil(this._sortedWindows.length / numRows);

		// If adding a new row does not change column count just stop
		// (for instance: 9 windows, with 3 rows -> 3 columns, 4 rows ->
		// 3 columns as well => just use 3 rows then)
		if (numColumns === lastNumColumns)
			break;

		const layout = this._layoutStrategy.computeLayout(this._sortedWindows, {
			numRows,
		});

		const [scale, space] = this._layoutStrategy.computeScaleAndSpace(layout, area);

		if (lastLayout && !this._isBetterScaleAndSpace(lastScale, lastSpace, scale, space))
			break;

		lastLayout = layout;
		lastNumColumns = numColumns;
		lastScale = scale;
		lastSpace = space;
	}

	return lastLayout;
}

// https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/workspace.js#L145
class UnalignedLayoutStrategy extends Workspace.LayoutStrategy {
	_newRow() {
		// Row properties:
		//
		// * x, y are the position of row, relative to area
		//
		// * width, height are the scaled versions of fullWidth, fullHeight
		//
		// * width also has the spacing in between windows. It's not in
		//   fullWidth, as the spacing is constant, whereas fullWidth is
		//   meant to be scaled
		//
		// * neither height/fullHeight have any sort of spacing or padding
		return {
			x: 0, y: 0,
			width: 0, height: 0,
			fullWidth: 0, fullHeight: 0,
			windows: [],
		};
	}

	// Computes and returns an individual scaling factor for @window,
	// to be applied in addition to the overall layout scale.
	_computeWindowScale(window) {
		// Since we align windows next to each other, the height of the
		// thumbnails is much more important to preserve than the width of
		// them, so two windows with equal height, but maybe differering
		// widths line up.
		// let ratio = window.boundingBox.height / this._monitor.height;

		// The purpose of this manipulation here is to prevent windows
		// from getting too small. For something like a calculator window,
		// we need to bump up the size just a bit to make sure it looks
		// good. We'll use a multiplier of 1.5 for this.

		// Map from [0, 1] to [1.5, 1]
		// return Util.lerp(1.5, 1, ratio);
		let height = window.boundingBox.height;
		let ratio = height / this._monitor.height;
		return (1 / ratio) / 2;
	}

	_computeRowSizes(layout) {
		let {rows, scale} = layout;
		for (let i = 0; i < rows.length; i++) {
			let row = rows[i];
			row.width = row.fullWidth * scale + (row.windows.length - 1) * this._columnSpacing;
			row.height = row.fullHeight * scale;
		}
	}

	_keepSameRow(row, window, width, idealRowWidth) {
		if (row.fullWidth + width <= idealRowWidth)
			return true;

		let oldRatio = row.fullWidth / idealRowWidth;
		let newRatio = (row.fullWidth + width) / idealRowWidth;

		if (Math.abs(1 - newRatio) < Math.abs(1 - oldRatio))
			return true;

		return false;
	}

	_sortRow(row) {
		// Sort windows horizontally to minimize travel distance.
		// This affects in what order the windows end up in a row.
		// row.windows.sort((a, b) => a.windowCenter.x - b.windowCenter.x);
	}

	computeLayout(windows, layoutParams) {
		layoutParams = Params.parse(layoutParams, {
			numRows: 0,
		});

		if (layoutParams.numRows === 0)
			throw new Error(`${this.constructor.name}: No numRows given in layout params`);

		const numRows = layoutParams.numRows;

		let rows = [];
		let totalWidth = 0;
		for (let i = 0; i < windows.length; i++) {
			let window = windows[i];
			let s = this._computeWindowScale(window);
			totalWidth += window.boundingBox.width * s;
		}

		let idealRowWidth = totalWidth / numRows;

		// Sort windows vertically to minimize travel distance.
		// This affects what rows the windows get placed in.
		let sortedWindows = windows.slice();
		// This is modified from the originial
		sortedWindows.sort((a, b) => a.metaWindow.get_user_time() < b.metaWindow.get_user_time());

		let windowIdx = 0;
		for (let i = 0; i < numRows; i++) {
			let row = this._newRow();
			rows.push(row);

			for (; windowIdx < sortedWindows.length; windowIdx++) {
				let window = sortedWindows[windowIdx];
				let s = this._computeWindowScale(window);
				let width = window.boundingBox.width * s;
				let height = window.boundingBox.height * s;
				row.fullHeight = Math.max(row.fullHeight, height);

				// either new width is < idealWidth or new width is nearer from idealWidth then oldWidth
				if (this._keepSameRow(row, window, width, idealRowWidth) || (i === numRows - 1)) {
					row.windows.push(window);
					row.fullWidth += width;
				} else {
					break;
				}
			}
		}

		let gridHeight = 0;
		let maxRow;
		for (let i = 0; i < numRows; i++) {
			let row = rows[i];
			this._sortRow(row);

			if (!maxRow || row.fullWidth > maxRow.fullWidth)
				maxRow = row;
			gridHeight += row.fullHeight;
		}

		return {
			numRows,
			rows,
			maxColumns: maxRow.windows.length,
			gridWidth: maxRow.fullWidth,
			gridHeight,
		};
	}

	computeScaleAndSpace(layout, area) {
		let hspacing = (layout.maxColumns - 1) * this._columnSpacing;
		let vspacing = (layout.numRows - 1) * this._rowSpacing;

		let spacedWidth = area.width - hspacing;
		let spacedHeight = area.height - vspacing;

		let horizontalScale = spacedWidth / layout.gridWidth;
		let verticalScale = spacedHeight / layout.gridHeight;

		// Thumbnails should be less than 70% of the original size
		let scale = Math.min(
			horizontalScale, verticalScale, WINDOW_PREVIEW_MAXIMUM_SCALE);

		let scaledLayoutWidth = layout.gridWidth * scale + hspacing;
		let scaledLayoutHeight = layout.gridHeight * scale + vspacing;
		let space = (scaledLayoutWidth * scaledLayoutHeight) / (area.width * area.height);

		layout.scale = scale;

		return [scale, space];
	}

	computeWindowSlots(layout, area) {
		this._computeRowSizes(layout);

		let {rows, scale} = layout;

		let slots = [];

		// Do this in three parts.
		let heightWithoutSpacing = 0;
		for (let i = 0; i < rows.length; i++) {
			let row = rows[i];
			heightWithoutSpacing += row.height;
		}

		let verticalSpacing = (rows.length - 1) * this._rowSpacing;
		let additionalVerticalScale = Math.min(1, (area.height - verticalSpacing) / heightWithoutSpacing);

		// keep track how much smaller the grid becomes due to scaling
		// so it can be centered again
		let compensation = 0;
		let y = 0;

		for (let i = 0; i < rows.length; i++) {
			let row = rows[i];

			// If this window layout row doesn't fit in the actual
			// geometry, then apply an additional scale to it.
			let horizontalSpacing = (row.windows.length - 1) * this._columnSpacing;
			let widthWithoutSpacing = row.width - horizontalSpacing;
			let additionalHorizontalScale = Math.min(1, (area.width - horizontalSpacing) / widthWithoutSpacing);

			if (additionalHorizontalScale < additionalVerticalScale) {
				row.additionalScale = additionalHorizontalScale;
				// Only consider the scaling in addition to the vertical scaling for centering.
				compensation += (additionalVerticalScale - additionalHorizontalScale) * row.height;
			} else {
				row.additionalScale = additionalVerticalScale;
				// No compensation when scaling vertically since centering based on a too large
				// height would undo what vertical scaling is trying to achieve.
			}

			row.x = area.x + (Math.max(area.width - (widthWithoutSpacing * row.additionalScale + horizontalSpacing), 0) / 2);
			row.y = area.y + (Math.max(area.height - (heightWithoutSpacing + verticalSpacing), 0) / 2) + y;
			y += row.height * row.additionalScale + this._rowSpacing;
		}

		compensation /= 2;

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const rowY = row.y + compensation;
			const rowHeight = row.height * row.additionalScale;

			let x = row.x;
			for (let j = 0; j < row.windows.length; j++) {
				let window = row.windows[j];

				let s = scale * this._computeWindowScale(window) * row.additionalScale;
				let cellWidth = window.boundingBox.width * s;
				let cellHeight = window.boundingBox.height * s;

				s = Math.min(s, WINDOW_PREVIEW_MAXIMUM_SCALE);
				let cloneWidth = window.boundingBox.width * s;
				const cloneHeight = window.boundingBox.height * s;

				let cloneX = x + (cellWidth - cloneWidth) / 2;
				let cloneY;

				// If there's only one row, align windows vertically centered inside the row
				if (rows.length === 1)
					cloneY = rowY + (rowHeight - cloneHeight) / 2;
				// If there are multiple rows, align windows to the bottom edge of the row
				else
					cloneY = rowY + rowHeight - cellHeight;

				// Align with the pixel grid to prevent blurry windows at scale = 1
				cloneX = Math.floor(cloneX);
				cloneY = Math.floor(cloneY);

				slots.push([cloneX, cloneY, cloneWidth, cloneHeight, window]);
				x += cellWidth + this._columnSpacing;
			}
		}
		return slots;
	}
}
