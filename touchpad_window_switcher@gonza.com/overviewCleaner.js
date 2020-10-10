/* exported orderOverview, disorderOverview */
const Workspace = imports.ui.workspace;


function _computeWindowScale(window) {
	let ratio = window.height / this._monitor.height;
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
			let width = window.width * s;
			let height = window.height * s;
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

		global.log(propertyName + " " + original)
		from[propertyName] = original;
	}
}

/**
 * Makes every window of the same size and orders the 
 * overview by last recent used
 */
function orderOverview() {
	saveAndReplace(Workspace.UnalignedLayoutStrategy.prototype, '_computeWindowScale', _computeWindowScale)
	saveAndReplace(Workspace, 'WINDOW_CLONE_MAXIMUM_SCALE', 0.7)
	saveAndReplace(Workspace.UnalignedLayoutStrategy.prototype, '_sortRow', (row) => {})
	saveAndReplace(Workspace.UnalignedLayoutStrategy.prototype, 'computeLayout', computeLayout)
}

function disorderOverview() {
	restoreAllProperties();
}
