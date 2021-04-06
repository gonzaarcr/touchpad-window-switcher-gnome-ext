/* exported orderOverview, disorderOverview */
const Config = imports.misc.config;
const Params = imports.misc.params;
const Workspace = imports.ui.workspace;

const SHELL_VERSION = Config.PACKAGE_VERSION;


function _computeWindowScale(window) {
	let height = SHELL_VERSION >= '3.38' ? window.boundingBox.height : window.height;
	let ratio = height / this._monitor.height;
	return (1 / ratio) / 2;
}

// https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/gnome-3-36/js/ui/workspace.js#L1041
// Same but sort modified
function computeLayout(windows, layout) {
	let numRows = layout.numRows;

	let rows = [];
	let totalWidth = 0;
	for (let i = 0; i < windows.length; i++) {
		let window = windows[i];
		let s = this._computeWindowScale(window);
		totalWidth += window.width * s;
	}

	let idealRowWidth = totalWidth / numRows;

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
			let width, height;
			if (SHELL_VERSION >= '3.38') {
				width = window.boundingBox.width * s;
				height = window.boundingBox.height * s;
			} else {
				width = window.width * s;
				height =  window.height * s;
			}
			row.fullHeight = Math.max(row.fullHeight, height);

			// either new width is < idealWidth or new width is nearer from idealWidth then oldWidth
			if (this._keepSameRow(row, window, width, idealRowWidth) || (i == numRows - 1)) {
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

	layout.rows = rows;
	layout.maxColumns = maxRow.windows.length;
	layout.gridWidth = maxRow.fullWidth;
	layout.gridHeight = gridHeight;
}

function computeLayout40(windows, layoutParams) {
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
	sortedWindows.sort((a, b) => b.metaWindow.get_user_time() - a.metaWindow.get_user_time());

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

var overviewOriginals = {}
function saveAndReplace(from, propertyName, newOne) {
	overviewOriginals[String(from) + '.' + String(propertyName)] = [ from, from[propertyName] ];
	from[propertyName] = newOne;
}

function restoreAllProperties() {
	for (let p of Object.getOwnPropertyNames(overviewOriginals)) {
		let propertyName = p.split('.');
		propertyName = propertyName[propertyName.length - 1];

		let from = overviewOriginals[p][0];
		let original = overviewOriginals[p][1];

		from[propertyName] = original;
	}
}

/**
 * Makes every window of the same size and orders the 
 * overview by last recent used
 */
function orderOverview() {
	saveAndReplace(Workspace.UnalignedLayoutStrategy.prototype, '_computeWindowScale', _computeWindowScale)
	// Windows on 40 are smaller
	if (SHELL_VERSION < '40')
		saveAndReplace(Workspace, SHELL_VERSION < '3.38' ? 'WINDOW_CLONE_MAXIMUM_SCALE' : 'WINDOW_PREVIEW_MAXIMUM_SCALE', 0.7)
	saveAndReplace(Workspace.UnalignedLayoutStrategy.prototype, '_sortRow', (row) => {})
	let cl = SHELL_VERSION < '40' ? computeLayout : computeLayout40;
	saveAndReplace(Workspace.UnalignedLayoutStrategy.prototype, 'computeLayout', cl)
}

function disorderOverview() {
	restoreAllProperties();
}
