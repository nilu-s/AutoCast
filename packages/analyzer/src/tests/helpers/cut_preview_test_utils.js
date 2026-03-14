'use strict';

function makeFilledArray(length, value) {
    var out = new Float32Array(length);
    for (var i = 0; i < length; i++) out[i] = value;
    return out;
}

function actionableItems(items) {
    var out = [];
    for (var i = 0; i < (items || []).length; i++) {
        var item = items[i];
        if (!item) continue;
        if (item.typeLabel === 'uninteresting_gap') continue;
        out.push(item);
    }
    return out;
}

module.exports = {
    makeFilledArray: makeFilledArray,
    actionableItems: actionableItems
};
