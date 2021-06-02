"use strict";
var _a;
exports.__esModule = true;
exports.list = exports.struct = exports.value = void 0;
/**
 * Valid `kind` types
 */
var Kind;
(function (Kind) {
    Kind["Struct"] = "structValue";
    Kind["List"] = "listValue";
    Kind["Number"] = "numberValue";
    Kind["String"] = "stringValue";
    Kind["Bool"] = "boolValue";
    Kind["Null"] = "nullValue";
})(Kind || (Kind = {}));
var toString = Object.prototype.toString;
var encoders = (_a = {},
    _a[typeOf({})] = function (v) { return wrap(Kind.Struct, exports.struct.encode(v)); },
    _a[typeOf([])] = function (v) { return wrap(Kind.List, exports.list.encode(v)); },
    _a[typeOf(0)] = function (v) { return wrap(Kind.Number, v); },
    _a[typeOf('')] = function (v) { return wrap(Kind.String, v); },
    _a[typeOf(true)] = function (v) { return wrap(Kind.Bool, v); },
    _a[typeOf(null)] = function () { return wrap(Kind.Null, 0); },
    _a);
function typeOf(value) {
    return toString.call(value);
}
function wrap(kind, value) {
    var _a;
    return _a = { kind: kind }, _a[kind] = value, _a;
}
function getKind(value) {
    if (value.kind) {
        return value.kind;
    }
    var validKinds = Object.values(Kind);
    for (var _i = 0, validKinds_1 = validKinds; _i < validKinds_1.length; _i++) {
        var kind = validKinds_1[_i];
        if (value.hasOwnProperty(kind)) {
            return kind;
        }
    }
    return null;
}
/**
 * Used to encode/decode {@link Value} objects.
 */
exports.value = {
    /**
     * Encodes a JSON value into a protobuf {@link Value}.
     *
     * @param {*} value The JSON value.
     * @returns {Value}
     */
    encode: function (value) {
        var type = typeOf(value);
        var encoder = encoders[type];
        if (typeof encoder !== 'function') {
            throw new TypeError("Unable to infer type for \"" + value + "\".");
        }
        return encoder(value);
    },
    /**
     * Decodes a protobuf {@link Value} into a JSON value.
     *
     * @throws {TypeError} If unable to determine value `kind`.
     *
     * @param {Value} value the protobuf value.
     * @returns {*}
     */
    decode: function (value) {
        var kind = getKind(value);
        if (!kind) {
            throw new TypeError("Unable to determine kind for \"" + value + "\".");
        }
        switch (kind) {
            case 'listValue':
                return exports.list.decode(value.listValue);
            case 'structValue':
                return exports.struct.decode(value.structValue);
            case 'nullValue':
                return null;
            default:
                return value[kind];
        }
    }
};
/**
 * Used to encode/decode {@link Struct} objects.
 */
exports.struct = {
    /**
     * Encodes a JSON object into a protobuf {@link Struct}.
     *
     * @param {Object.<string, *>} value the JSON object.
     * @returns {Struct}
     */
    encode: function (json) {
        var fields = {};
        Object.keys(json).forEach(function (key) {
            // If value is undefined, do not encode it.
            if (typeof json[key] === 'undefined')
                return;
            fields[key] = exports.value.encode(json[key]);
        });
        return { fields: fields };
    },
    /**
     * Decodes a protobuf {@link Struct} into a JSON object.
     *
     * @param {Struct} struct the protobuf struct.
     * @returns {Object.<string, *>}
     */
    decode: function (_a) {
        var fields = _a.fields;
        var json = {};
        Object.keys(fields).forEach(function (key) {
            json[key] = exports.value.decode(fields[key]);
        });
        return json;
    }
};
/**
 * Used to encode/decode {@link ListValue} objects.
 */
exports.list = {
    /**
     * Encodes an array of JSON values into a protobuf {@link ListValue}.
     *
     * @param {Array.<*>} values the JSON values.
     * @returns {ListValue}
     */
    encode: function (values) {
        return {
            values: (values || []).map(exports.value.encode)
        };
    },
    /**
     * Decodes a protobuf {@link ListValue} into an array of JSON values.
     *
     * @param {ListValue} list the protobuf list value.
     * @returns {Array.<*>}
     */
    decode: function (_a) {
        var values = _a.values || []
        return values.map(exports.value.decode);
    }
};
//# sourceMappingURL=index.js.map