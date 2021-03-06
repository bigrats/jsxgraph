/*
 Copyright 2008-2013
 Matthias Ehmann,
 Michael Gerhaeuser,
 Carsten Miller,
 Bianca Valentin,
 Heiko Vogel,
 Alfred Wassermann,
 Peter Wilfahrt

 This file is part of JSXGraph.

 JSXGraph is free software dual licensed under the GNU LGPL or MIT License.

 You can redistribute it and/or modify it under the terms of the

 * GNU Lesser General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version
 OR
 * MIT License: https://github.com/jsxgraph/jsxgraph/blob/master/LICENSE.MIT

 JSXGraph is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU Lesser General Public License for more details.

 You should have received a copy of the GNU Lesser General Public License and
 the MIT License along with JSXGraph. If not, see <http://www.gnu.org/licenses/>
 and <http://opensource.org/licenses/MIT/>.
 */

/*global JXG: true*/
/*jslint nomen: true, plusplus: true*/

/* depends:
 jxg
 base/constants
 math/math
 options
 utils/zip
 utils/encoding
 utils/base64
 utils/uuid
 utils/type
 */

(function () {

    "use strict";

    // this is a small workaround to adapt the SketchReader to our new file API
    // we don't have to change anything in sketchometry.
    JXG.SketchReader = function (board, str) {
        this.read = function () {
            var i, t, arr, unzipped, meta, constr;

            unzipped = new JXG.Util.Unzip(JXG.Util.Base64.decodeAsArray(str)).unzip();

            if (!JXG.exists(unzipped[0])) {
                return '';
            }

            unzipped = JXG.Util.UTF8.decode(unzipped[0][0]);
            constr = JSON.parse(unzipped);

            meta = constr.pop();

            if (!JXG.exists(meta.unredo)) {
                t = constr.length - 1;
            } else {
                t = meta.unredo;
            }

            for (i = 0; i <= t; i++) {
                if (constr[i].type !== 0) {
                    try {
                        if (constr[i].type > 50) {
                            arr = JXG.SketchReader.generateJCodeMeta(constr[i], board);
                        } else {
                            arr = JXG.SketchReader.generateJCode(constr[i], board, constr);
                        }
                    } catch (e) {
                        JXG.debug('#steps: ' + constr.length);
                        JXG.debug('step: ' + i + ', type: ' + constr[i].type);
                        JXG.debug(constr[i]);
                    }

                    board.jc.parse(arr[0], true);
                }
            }


            // bounding box
            arr = meta.boundingBox;
            board.jc.parse('$board.setView(' + JSON.stringify(arr) + ');');

            return '';
        };
    };

    // No prototype here
    JXG.extend(JXG.SketchReader, /** @lends JXG.SketchReader */ {
        generateJCodeMeta: function () {
            return ['', '', '', ''];
        },

        id: function () {
            return JXG.Util.genUUID();
        },

        generator: {
            toFixed: 8, // should be enough for now ...
            freeLine: false,
            useGlider: false,
            useSymbols: false
        },

        /**
         * Generates {@link JXG.JessieCode} code from a sketchometry construction step.
         * @param {Object} step
         * @param {Number} step.type One of the JXG.GENTYPE_* constant values
         * @param {Array} step.args Mostly visual properties
         * @param {Array} step.src_ids Parent element ids
         * @param {Array} step.dest_sub_ids Ids for subelements, e.g. the center of a circumcircle or the baseline
         * of a glider
         * @param {String} step.dest_id Id of the generated main element
         * @param {JXG.Board} board
         * @param {Array} step_log The complete step log
         * @returns {Array} JessieCode to set and reset the step.
         */
        generateJCode: function (step, board, step_log) {
            var i, j, k, sub_id, str, str1, str2, objects, pid1, pid2, pid3,
                xstart, ystart, el, arr, step2, options, assign, attrid,
                copy_log = [],
                set_str = '',
                reset_str = '',
                ctx_set_str = '',
                ctx_reset_str = '',

            // these two could be outsourced into the iife surrounding the SketchReader definition

            // print number -- helper to prepare numbers
            // for printing, e.g. trim them with toFixed()
                pn = function (v) {
                    if (options.toFixed > 0) {
                        // toFixed is a method if Number since JavaScript 1.5, resp. ECMAScript (ECMA 262) 3rd Edition
                        // introduced somewhat around 1999/2000. It is part of every recent version of every major browser.
                        // See this table: http://en.wikipedia.org/wiki/JavaScript#Versions
                        // The only possible explanation is that v might not be a number but a string or something else.
                        // In that case the caller should be fixed instead of rendering this function completely useless.

                        // make sure v is a float (or NaN if it neither is a float nor could be converted to float).
                        v = parseFloat(v);
                        v = v.toFixed(options.toFixed); // toFixed is not a member function of the Number class ...
                    }

                    return v;
                },

                getObject = function (v) {
                    var o;

                    if (options.useSymbols) {
                        if (board.jc.sstack[0][v]) {
                            o = board.jc.sstack[0][v];
                        } else {
                            o = objects[v];
                        }
                    } else {
                        o = objects[v];
                    }

                    return o;
                };



            options = JXG.SketchReader.generator;
            objects = board.objects;

            assign = '';
            attrid = 'id: \'' + step.dest_id + '\', ';

            if (JXG.exists(board) && options.useSymbols && step.type !== JXG.GENTYPE_ABLATION) {
                attrid = '';
                assign = step.dest_id + ' = ';

                for (i = 0; i < step.src_ids.length; i++) {
                    str = board.jc.findSymbol(getObject(step.src_ids[i]), 0);

                    if (str.length > 0) {
                        step.src_ids[i] = str[0];
                    }
                }
            }

            if (step.type > 50) {
                return JXG.SketchReader.generateJCodeMeta(step, board);
            }

            switch (step.type) {

                case JXG.GENTYPE_TRUNCATE:
                    set_str = 'trunclen = ' + JXG.Options.trunclen + '; ';
                    break;

                case JXG.GENTYPE_JCODE:
                    set_str = step.args.code;
                    break;

                case JXG.GENTYPE_AXIS:
                    set_str = step.args.name[0] + ' = point(' + step.args.coords[0].usrCoords[1] + ', ';
                    set_str += step.args.coords[0].usrCoords[2] + ') <<id: \'' + step.dest_sub_ids[0] + '\', name: \'';
                    set_str += step.args.name[0] + '\', fixed: true, priv: true, visible: false>>; ' + step.args.name[1];
                    set_str += ' = point(' + step.args.coords[1].usrCoords[1] + ', ';
                    set_str += step.args.coords[1].usrCoords[2] + ') <<id: \'' + step.dest_sub_ids[1] + '\', name: \'';
                    set_str += step.args.name[1] + '\', fixed: true, priv: true, visible: false>>; ' + step.args.name[2];
                    set_str += ' = point(' + step.args.coords[2].usrCoords[1] + ', ';
                    set_str += step.args.coords[2].usrCoords[2] + ') <<id: \'' + step.dest_sub_ids[2] + '\', name: \'';
                    set_str += step.args.name[2] + '\', fixed: true, priv: true, visible: false>>; ';

                    set_str += step.args.name[3] + ' = axis(' + step.args.name[0] + ', ' + step.args.name[1] + ') ';
                    set_str += '<<id: \'' + step.dest_sub_ids[3] + '\', name: \'' + step.args.name[3] + '\', ticks: ';
                    set_str += '<<minorHeight:0, majorHeight:10, ticksDistance: 1, drawLabels: true, drawZero: true>>>>; ';
                    set_str += step.args.name[4] + ' = axis(' + step.args.name[0] + ', ' + step.args.name[2] + ') ';
                    set_str += '<<id: \'' + step.dest_sub_ids[4] + '\', name: \'' + step.args.name[4] + '\', ticks: ';
                    set_str += '<<minorHeight:0, majorHeight:10, ticksDistance: 1, drawLabels: true, drawZero: true>>>>; ';

                    set_str += step.dest_sub_ids[3] + '.visible = false; ';
                    set_str += step.dest_sub_ids[4] + '.visible = false; ';

                    set_str += 'delete jxgBoard1_infobox; ';

                    reset_str = 'delete ' + step.dest_sub_ids[4] + '; delete ' + step.dest_sub_ids[3];
                    reset_str += '; delete ' + step.dest_sub_ids[2] + '; ';
                    reset_str += 'delete ' + step.dest_sub_ids[1] + '; delete ' + step.dest_sub_ids[0] + '; ';

                    break;

                case JXG.GENTYPE_MID:
                    set_str = assign + 'midpoint(' + step.src_ids[0] + ', ' + step.src_ids[1] + ') <<' + attrid;
                    set_str += 'fillColor: \'' + step.args.fillColor + '\'>>; ';
                    reset_str = 'delete ' + step.dest_id + '; ';
                    break;

                case JXG.GENTYPE_REFLECTION:
                    set_str = assign + 'reflection(' + step.src_ids[0] + ', ' + step.src_ids[1] + ') <<' + attrid;
                    set_str += 'fillColor: \'' + step.args.fillColor + '\'>>; ';
                    reset_str = 'delete ' + step.dest_id + '; ';
                    break;

                case JXG.GENTYPE_MIRRORPOINT:
                    set_str = assign + 'mirrorpoint(' + step.src_ids[1] + ', ' + step.src_ids[0] + ') <<' + attrid;
                    set_str += 'fillColor: \'' + step.args.fillColor + '\'>>; ';
                    reset_str = 'delete ' + step.dest_id + '; ';
                    break;

                case JXG.GENTYPE_TANGENT:
                    if (step.args.create_point) {
                        sub_id = step.dest_sub_ids[2];
                        set_str = 'point(' + pn(step.args.usrCoords[1]) + ',' + pn(step.args.usrCoords[2]) + ') <<id: \'';
                        set_str += sub_id + '\', fillColor: \'' + step.args.fillColor + '\'>>; ' + sub_id + '.glide(';
                        set_str += step.src_ids[0] + '); ';
                        reset_str = 'delete ' + sub_id + '; ';
                    } else {
                        sub_id = step.src_ids[0];
                    }

                    set_str += assign + 'tangent(' + sub_id + ') <<' + attrid + 'point1: <<name: \'' + step.dest_sub_ids[0];
                    set_str += '\', id: \'' + step.dest_sub_ids[0] + '\', priv: true>>, point2: <<name: \'' + step.dest_sub_ids[1];
                    set_str += '\', id: \'' + step.dest_sub_ids[1] + '\', priv: true>> >>; ';
                    reset_str = 'delete ' + step.dest_sub_ids[0] + '; ' + reset_str;
                    reset_str = 'delete ' + step.dest_id + '; delete ' + step.dest_sub_ids[1] + '; ' + reset_str;
                    break;

                case JXG.GENTYPE_PARALLEL:
                    if (step.args.create_point) {
                        sub_id = step.dest_sub_ids[1];
                        set_str = 'point(' + pn(step.args.usrCoords[1]) + ', ' + pn(step.args.usrCoords[2]) + ') <<id: \'';
                        set_str += sub_id + '\', name: \'\', visible: false, priv: true>>; ';
                        reset_str = 'delete ' + sub_id + '; ';
                    } else {
                        sub_id = step.src_ids[1];
                    }

                    set_str += assign + 'parallel(' + step.src_ids[0] + ', ' + sub_id + ') <<' + attrid + 'name: \'\', point: <<id: \'';
                    set_str += step.dest_sub_ids[0] + '\', name: \'' + step.dest_sub_ids[0] + '\'>> >>; ';
                    reset_str = 'delete ' + step.dest_id + '; delete ' + step.dest_sub_ids[0] + '; ' + reset_str;
                    break;

                case JXG.GENTYPE_BISECTORLINES:
                    set_str = 'bisectorlines(' + step.src_ids[0] + ', ' + step.src_ids[1] + ') <<line1: <<id: \'';
                    set_str = set_str + step.dest_sub_ids[2] + '\', point1: <<id: \'' + step.dest_sub_ids[1];
                    set_str += '\', name: \'' + step.dest_sub_ids[1] + '\'>>, point2: <<id: \'' + step.dest_sub_ids[0];
                    set_str += '\', name: \'' + step.dest_sub_ids[0] + '\'>>>>, line2: <<id: \'' + step.dest_sub_ids[5];
                    set_str += '\', point1: <<id: \'' + step.dest_sub_ids[4] + '\', name: \'' + step.dest_sub_ids[4];
                    set_str += '\'>>, point2: <<id: \'' + step.dest_sub_ids[3] + '\', name: \'' + step.dest_sub_ids[3];
                    set_str += '\'>>>>>>; ';
                    reset_str = 'delete ' + step.dest_sub_ids[5] + '; delete ' + step.dest_sub_ids[4] + '; delete ';
                    reset_str += step.dest_sub_ids[3] + '; delete ' + step.dest_sub_ids[2] + '; delete ';
                    reset_str += step.dest_sub_ids[1] + '; delete ' + step.dest_sub_ids[0] + '; ';
                    break;

                case JXG.GENTYPE_BOARDIMG:
                    set_str = "image('" + step.args.s + "', [ " + step.args.anchor + " ], [ " + step.args.scale + " ]) ";
                    set_str += "<<id: '" + step.dest_id + "'>>; ";

                    reset_str = "delete " + step.dest_id + "; ";
                    break;

                case JXG.GENTYPE_BISECTOR:
                    if (step.args.create_point) {
                        // TODO: use "if (options.useGlider) {"

                        // Projection to first line
                        pid1 = step.dest_sub_ids[1];
                        set_str = 'point(' + pn(step.args.usrCoords[1]) + ', ' + pn(step.args.usrCoords[2]) + ') ';
                        set_str += '<<id:\'' + pid1 + '\', ';
                        set_str += 'name:\'\', priv:true, visible:false >>; ';
                        set_str += pid1 + '.glide(' + step.src_ids[0] + '); ';
                        reset_str = 'delete ' + pid1 + '; ';

                        // Projection to second line
                        pid2 = step.dest_sub_ids[2];
                        set_str += 'point(' + pn(step.args.usrCoords[1]) + ', ' + pn(step.args.usrCoords[2]) + ') ';
                        set_str += '<<id:\'' + pid2 + '\', ';
                        set_str += 'name:\'\', priv:true, visible:false >>; ';
                        set_str += pid2 + '.glide(' + step.src_ids[1] + '); ';
                        reset_str += 'delete ' + pid2 + '; ';

                        if (step.args.create_intersection) {
                            // intersection point
                            pid3 = step.dest_sub_ids[3];
                            set_str += 'intersection(' + step.src_ids[0] + ', ' + step.src_ids[1] + ', 0) ';
                            set_str += '<<id:\'' + pid3 + '\', fillColor: \'' + step.args.fillColor + '\', ';
                            set_str += 'name:\'\', priv:true, visible:false >>; ';
                            reset_str += 'delete ' + pid3 + '; ';
                        } else {
                            pid3 = step.src_ids[2];
                        }

                        set_str += assign + 'bisector(' + pid1 + ', ' + pid3 + ', ' + pid2 + ') ';
                        set_str += '<<' + attrid + 'name: \'\', point: <<id: \'' + step.dest_sub_ids[0] + '\', priv: true, name: \'';
                        set_str += step.dest_sub_ids[0] + '\'>> >>;';
                        reset_str += 'delete ' + step.dest_id + '; delete ' + step.dest_sub_ids[0] + ';';
                    } else {
                        set_str = assign + 'bisector(' + step.src_ids[1] + ', ' + step.src_ids[2] + ', ' + step.src_ids[0];
                        set_str += ') <<' + attrid + 'name: \'\', point: <<id: \'' + step.dest_sub_ids[0] + '\', priv: true, name: \'';
                        set_str += step.dest_sub_ids[0] + '\'>>>>;';
                        reset_str = 'delete ' + step.dest_id + '; delete ' + step.dest_sub_ids[0] + ';';
                    }
                    break;

                case JXG.GENTYPE_NORMAL:
                    if (step.args.create_point) {
                        sub_id = step.dest_sub_ids[1];
                        set_str = 'point(' + pn(step.args.usrCoords[1]) + ', ' + pn(step.args.usrCoords[2]);
                        set_str += ') <<id: \'' + sub_id + '\', name: \'\', visible: false, priv: true>>; ';
                        reset_str = 'delete ' + sub_id + '; ';
                    } else {
                        sub_id = step.src_ids[1];
                    }

                    set_str += assign + 'normal(' + sub_id + ', ' + step.src_ids[0] + ') <<' + attrid;
                    set_str += 'name: \'\', point: <<id: \'' + step.dest_sub_ids[0] + '\', name: \'' + step.dest_sub_ids[0];
                    set_str += '\'>> >>; ';
                    reset_str = 'delete ' + step.dest_id + '; delete ' + step.dest_sub_ids[0] + '; ' + reset_str;
                    break;

                case JXG.GENTYPE_PERPSEGMENT:
                    set_str += assign + 'perpendicularsegment(' + step.src_ids[1] + ', ' + step.src_ids[0] + ') <<' + attrid;
                    set_str += 'name: \'\', point: <<id: \'' + step.dest_sub_ids[0] + '\', name: \'' + step.dest_sub_ids[0];
                    set_str += '\'>> >>; ';
                    reset_str = 'delete ' + step.dest_id + '; delete ' + step.dest_sub_ids[0] + '; ' + reset_str;
                    break;

                case JXG.GENTYPE_POINT:
                    set_str = assign + 'point(' + pn(step.args.usrCoords[1]) + ', ' + pn(step.args.usrCoords[2]);
                    set_str += ')' + (options.useSymbols ? '' : ' <<id: \'' + step.dest_id + '\''
                        + ', snaptogrid: ' + JXG.Options.elements.snapToGrid
                        + ', snaptopoints: ' + JXG.Options.elements.snapToPoints + '>>') + '; ';

                    reset_str = 'delete ' + step.dest_id + '; ';
                    break;

                case JXG.GENTYPE_GLIDER:
                    if (options.useGlider) {
                        set_str = assign + 'glider(' + pn(step.args.usrCoords[1]) + ', ' + pn(step.args.usrCoords[2]);
                        set_str += ', ' + step.src_ids[0] + ')';
                        set_str += (options.useSymbols ? '' : '<<id: \'' + step.dest_id + '\''
                            + ', snaptogrid: false, snaptopoints: false'
                            + ', snaptopoints: ' + JXG.Options.elements.snapToPoints + '>>') + ';';

                    } else {
                        set_str = assign + 'point(' + pn(step.args.usrCoords[1]) + ', ' + pn(step.args.usrCoords[2]);
                        set_str += ') <<' + attrid + 'fillColor: \'' +  JXG.Options.glider.fillColor + '\'>>; ' + step.dest_id;
                        set_str += '.glide(' + step.src_ids[0] + '); ';
                    }

                    if (!(step.args && step.args.undoIsEmpty)) {
                        reset_str = 'delete ' + step.dest_id + '; ';
                    }

                    break;

                case JXG.GENTYPE_INTERSECTION:
                    set_str = assign + 'intersection(' + step.src_ids[0] + ', ' + step.src_ids[1] + ', ' + step.args.choice;
                    set_str += ') <<' + attrid + ' fillColor: \'' + JXG.Options.intersection.fillColor + '\'>>; ';

                    if (!(step.args && step.args.undoIsEmpty)) {
                        reset_str = 'delete ' + step.dest_id + '; ';
                    }

                    break;

                case JXG.GENTYPE_MIGRATE:

                    set_str = '$board.migratePoint(' + step.src_ids[0] + ', ' + step.dest_id + ', false); ';

                    if (step.args && step.args.migrateToGlider) {

                        var o, gl, uc1, uc2;

                        reset_str = step.dest_id + '.free(); ' + step.dest_id;
                        reset_str += '.fillColor = \'' + step.args.fillColor + '\'; ' + step.dest_id;
                        reset_str += '.strokeColor = \'' + step.args.strokeColor + '\'; ';

                        uc1 = step.args.usrCoords[1];
                        uc2 = step.args.usrCoords[2];

                        reset_str += 'point(' + uc1 + ', ' + uc2 + ')';
                        reset_str += ' <<id: \'' + step.src_ids[0] + '\', name: \'\'>>' + '; ';
                        reset_str += '$board.migratePoint(' + step.dest_id + ', ' + step.src_ids[0] + ', false); ';
                        reset_str += step.src_ids[0] + '.name = \'' + step.args.orig_name + '\'; ';
                        reset_str += step.src_ids[0] + '.label.setText(\'' + step.args.orig_name + '\'); ';

                        o = board.objects[step.dest_id];
                        gl = o.slideObject.id;

                        uc1 = o.coords.usrCoords[1];
                        uc2 = o.coords.usrCoords[2];

                        reset_str +=  assign + 'point(' + uc1 + ', ' + uc2 + ') ';
                        reset_str += '<<' + attrid + 'fillColor: \'' +  JXG.Options.glider.fillColor + '\'>>; ';
                        reset_str += step.dest_id + '.glide(' + gl + '); ';

                    } else {
                        reset_str = 'delete ' + step.dest_id + '; ';
                    }

                    break;

                case JXG.GENTYPE_COMBINED:

                    set_str = reset_str = '';

                    for (i = 0; i < step.args.steps.length; i++) {
                        arr = this.generateJCode(step.args.steps[i], board, step_log);

                        set_str = set_str + arr[0];
                        reset_str = arr[2] + reset_str;
                    }

                    break;

                case JXG.GENTYPE_CIRCLE:
                    reset_str = 'delete ' + step.dest_sub_ids[0] + '; ';

                    if (step.args.create_point) {
                        set_str = 'point(' + pn(step.args.usrCoords[1]) + ', ' + pn(step.args.usrCoords[2]);
                        set_str += ') <<id: \'' + step.dest_sub_ids[0] + '\', priv: false>>; ';

                        set_str += assign + 'circle(' + step.dest_sub_ids[0] + ', ' + step.src_ids[0] + ') <<' + attrid;
                        set_str += 'name: \'\', fillOpacity: ' + JXG.Options.opacityLevel
                            + ', snaptogrid: ' + JXG.Options.elements.snapToGrid
                            + ', snaptopoints: ' + JXG.Options.elements.snapToPoints + '>>;';

                        reset_str = 'delete ' + step.dest_id + '; ' + reset_str;
                    } else if (step.args.create_by_radius) {
                        set_str = 'point(' + pn(step.args.x) + ', ' + pn(step.args.y) + ') <<id: \'' + step.dest_sub_ids[0];
                        set_str += '\', name: \'\', withLabel: true, visible: true, priv: false>>; ';
                        set_str += step.dest_sub_ids[0] + '.visible = true; ';
                        set_str += assign + 'circle(\'' + step.dest_sub_ids[0] + '\', ' + pn(step.args.r) + ') <<' + attrid;
                        set_str += 'name: \'\', fillOpacity: ' + JXG.Options.opacityLevel
                            + ', snaptogrid: ' + JXG.Options.elements.snapToGrid
                            + ', snaptopoints: ' + JXG.Options.elements.snapToPoints + '>>;';

                        reset_str = 'delete ' + step.dest_id + '; delete ' + step.dest_sub_ids[0] + '; ';
                    } else {
                        set_str = assign + 'circle(' + step.src_ids[0] + ', ' + step.src_ids[1] + ', ' + step.src_ids[2];
                        set_str += ') <<center: <<id: \'' + step.dest_sub_ids[0] + '\', name: \'' + step.dest_sub_ids[0];
                        set_str += '\', visible: true>>, ' + attrid + 'name: \'\', fillOpacity: ' + JXG.Options.opacityLevel
                            + ', snaptogrid: ' + JXG.Options.elements.snapToGrid
                            + ', snaptopoints: ' + JXG.Options.elements.snapToPoints + '>>; ';

                        reset_str = 'delete ' + step.dest_id + '; ' + reset_str;
                    }

                    break;

                case JXG.GENTYPE_CIRCLE2POINTS:
                    if (step.args.create_two_points) {
                        set_str = 'point(' + pn(step.args.x1) + ', ' + pn(step.args.y1) + ') <<id: \'' + step.dest_sub_ids[0];
                        set_str += '\'>>; ';
                        set_str += 'point(' + pn(step.args.x2) + ', ' + pn(step.args.y2) + ') <<id: \'';
                        set_str += step.dest_sub_ids[1] + '\'>>; ';
                        set_str += assign + 'circle(' + step.dest_sub_ids[0] + ', ' + step.dest_sub_ids[1] + ') <<' + attrid;
                        set_str += 'name: \'\', fillOpacity: ' + JXG.Options.opacityLevel
                            + ', snaptogrid: ' + JXG.Options.elements.snapToGrid
                            + ', snaptopoints: ' + JXG.Options.elements.snapToPoints + '>>; ';

                        reset_str = 'delete ' + step.dest_id + '; delete ' + step.dest_sub_ids[1] + '; delete ';
                        reset_str += step.dest_sub_ids[0] + '; ';
                    } else if (step.args.create_point) {
                        set_str = 'point(' + pn(step.args.x) + ', ' + pn(step.args.y) + ') <<id: \'' + step.dest_sub_ids[0];
                        set_str += '\'>>; ';
                        set_str += assign + 'circle(' + step.dest_sub_ids[0] + ', ' + step.src_ids[0] + ') <<' + attrid;
                        set_str += 'name: \'\', fillOpacity: ' + JXG.Options.opacityLevel
                            + ', snaptogrid: ' + JXG.Options.elements.snapToGrid
                            + ', snaptopoints: ' + JXG.Options.elements.snapToPoints + '>>; ';

                        reset_str = 'delete ' + step.dest_id + '; delete ' + step.dest_sub_ids[0] + '; ';
                    } else if (step.args.create_by_radius) {
                        set_str = assign + 'circle(' + step.src_ids[0] + ', ' + step.args.r + ') <<' + attrid;
                        set_str += 'name: \'\', fillOpacity: ' + JXG.Options.opacityLevel
                            + ', snaptogrid: ' + JXG.Options.elements.snapToGrid
                            + ', snaptopoints: ' + JXG.Options.elements.snapToPoints + '>>; ';

                        reset_str = 'delete ' + step.dest_id + '; ';
                    } else {
                        set_str = assign + 'circle(' + step.src_ids[0] + ', ' + step.src_ids[1] + ') <<' + attrid;
                        set_str += 'name: \'\', fillOpacity: ' + JXG.Options.opacityLevel
                            + ', snaptogrid: ' + JXG.Options.elements.snapToGrid
                            + ', snaptopoints: ' + JXG.Options.elements.snapToPoints + '>>; ';

                        reset_str = 'delete ' + step.dest_id + '; ';
                    }

                    break;

                case JXG.GENTYPE_LINE:

                    k = 0;
                    j = 0;

                    if (step.args.create_point1) {
                        pid1 = step.dest_sub_ids[k];
                        k += 1;
                        str1 = [];
                        for (i = 0; i < step.args.p1.length; i++) {
                            str1[i] = pn(step.args.p1[i]);
                        }

                        set_str = 'point(' + str1.join(', ') + ') <<id: \'' + pid1 + '\', name: \'\', visible: false, ';
                        set_str += 'snaptogrid: false, snaptopoints: false, priv: true>>; ';
                        reset_str = 'delete ' + pid1 + '; ';
                    } else {
                        pid1 = step.src_ids[j];
                        j += 1;
                    }

                    if (step.args.create_point2) {
                        pid2 = step.dest_sub_ids[k++];
                        str1 = [];
                        for (i = 0; i < step.args.p2.length; i++) {
                            str1[i] = pn(step.args.p2[i]);
                        }

                        set_str += 'point(' + str1.join(', ') + ') <<id: \'' + pid2 + '\', name: \'\', visible: false, ';
                        set_str += 'snaptogrid: false, snaptopoints: false, priv: true>>; ';
                        reset_str = 'delete ' + pid2 + '; ' + reset_str;
                    } else {
                        pid2 = step.src_ids[j];
                        j += 1;
                    }

                    str = 'line';
                    str1 = '';

                    // the line's parents
                    str2 = pid1 + ', ' + pid2;

                    // if we want a truly free line
                    if (step.args.create_point1 && step.args.create_point2 && options.freeLine) {
                        // forget the points
                        set_str = '';
                        reset_str = '';

                        // use the stdform instead
                        if (step.args.p1.length === 2) {
                            step.args.p1.unshift(1);
                        }

                        if (step.args.p2.length === 2) {
                            step.args.p2.unshift(1);
                        }

                        str2 = JXG.Math.crossProduct(step.args.p1, step.args.p2);
                        for (i = 0; i < str2.length; i++) {
                            str2[i] = pn(str2[i]);
                        }

                        str2 = str2.join(', ');
                    }

                    if (!step.args.first && !step.args.last) {
                        str = 'segment';
                    } else {
                        if (!step.args.first) {
                            str1 = 'straightFirst: ' + step.args.first;
                        }

                        if (!step.args.last) {
                            str1 = 'straightLast: ' + step.args.last;
                        }

                        if (str1.length > 0 && !options.useSymbols) {
                            str1 += ', ';
                        }
                    }

                    // this is a corner case, we have to get rid of the ',' at the end
                    // simple solution: rebuild attrid
                    if (!options.useSymbols) {
                        attrid = 'id: \'' + step.dest_id + '\'';
                    }

                    set_str += assign + str + '(' + str2 + ')';

                    if (str1.length + attrid.length > 0) {
                        set_str += ' <<' + str1 + attrid + ', name: \'\', snaptogrid: ' + JXG.Options.elements.snapToGrid
                            + ', snaptopoints: ' + JXG.Options.elements.snapToPoints + '>>; ';

                    } else {
                        set_str += ' <<name: \'\', snaptogrid: ' + JXG.Options.elements.snapToGrid
                            + ', snaptopoints: ' + JXG.Options.elements.snapToPoints + '>>; ';
                    }

                    reset_str = 'delete ' + step.dest_id + '; ' + reset_str;

                    break;

                case JXG.GENTYPE_SLOPETRIANGLE:
                    set_str = assign + 'slopetriangle(' + step.src_ids[0] + ') <<';
                    set_str += attrid + ' name: \'\',';
                    set_str += 'borders: <<ids: [\'' + step.dest_sub_ids[4] + '\', \'' + step.dest_sub_ids[5] + '\', \'' + step.dest_sub_ids[6] + '\']>>,';
                    set_str += 'basepoint: <<id: \'' + step.dest_sub_ids[0] + '\'>>, baseline: <<id: \'' + step.dest_sub_ids[1] + '\'>>,';
                    set_str += 'glider: <<id: \'' + step.dest_sub_ids[2] + '\'>>, toppoint: <<id: \'' + step.dest_sub_ids[3] + '\'>>';
                    set_str += '>>;';
                    reset_str = 'delete ' + step.dest_id + '; ';

                    break;

                case JXG.GENTYPE_TRIANGLE:
                    for (i = 0; i < step.args.create_point.length; i++) {
                        if (step.args.create_point[i]) {
                            set_str += 'point(' + pn(step.args.coords[i].usrCoords[1]) + ', ';
                            set_str += pn(step.args.coords[i].usrCoords[2]) + ') <<id: \'' + step.dest_sub_ids[i];
                            set_str +=  '\', snaptogrid: ' + JXG.Options.elements.snapToGrid;
                            set_str += ', snaptopoints: ' + JXG.Options.elements.snapToPoints + '>>; ';
                        }
                    }

                    for (i = 0; i < step.dest_sub_ids.length; i++) {
                        if (step.dest_sub_ids[i] !== 0) {
                            reset_str = 'delete ' + step.dest_sub_ids[i] + '; ' + reset_str;
                        }
                    }

                    reset_str = 'delete ' + step.dest_id + '; ' + reset_str;
                    set_str += assign + 'polygon(';

                    for (i = 0; i < step.src_ids.length; i++) {
                        set_str += step.src_ids[i];
                        if (i < step.src_ids.length - 1) {
                            set_str += ', ';
                        }
                    }

                    for (i = 0; i < 3; i++) {
                        if (step.dest_sub_ids[i] !== 0) {
                            if (step.src_ids.length > 0 || i > 0) {
                                set_str += ', ';
                            }
                            set_str += step.dest_sub_ids[i];
                        }
                    }

                    set_str += ') <<borders: <<ids: [ \'' + step.dest_sub_ids[3] + '\', \'' + step.dest_sub_ids[4];
                    set_str += '\', \'' + step.dest_sub_ids[5] + '\' ]';
                    set_str += ', name: \'\'>>, ' + attrid + ' fillOpacity: ';
                    set_str += JXG.Options.opacityLevel + ', name: \'\', hasInnerPoints:' + JXG.Options.polygon.hasInnerPoints;
                    set_str += ', snaptogrid: ' + JXG.Options.elements.snapToGrid;
                    set_str += ', snaptopoints: ' + JXG.Options.elements.snapToPoints + ', scalable:true>>; ';
                    break;

                case JXG.GENTYPE_QUADRILATERAL:
                    for (i = 0; i < step.args.create_point.length; i++) {
                        if (step.args.create_point[i]) {
                            set_str += 'point(' + pn(step.args.coords[i].usrCoords[1]) + ', ';
                            set_str += pn(step.args.coords[i].usrCoords[2]) + ') <<id: \'' + step.dest_sub_ids[i];
                            set_str += '\', snaptogrid: ' + JXG.Options.elements.snapToGrid;
                            set_str += ', snaptopoints: ' + JXG.Options.elements.snapToPoints + '>>; ';
                        }
                    }

                    for (i = 0; i < step.dest_sub_ids.length; i++) {
                        if (step.dest_sub_ids[i] !== 0) {
                            reset_str = 'delete ' + step.dest_sub_ids[i] + '; ' + reset_str;
                        }
                    }

                    reset_str = 'delete ' + step.dest_id + '; ' + reset_str;
                    set_str += assign + 'polygon(';

                    for (i = 0; i < step.src_ids.length; i++) {
                        set_str += step.src_ids[i];
                        if (i < step.src_ids.length - 1) {
                            set_str += ', ';
                        }
                    }

                    set_str += ') <<borders: <<ids: [ \'' + step.dest_sub_ids[4] + '\', \'' + step.dest_sub_ids[5];
                    set_str += '\', \'';
                    set_str += step.dest_sub_ids[6] + '\', \'' + step.dest_sub_ids[7] + '\' ]';
                    set_str += ', name: \'\'>>, ' + attrid;
                    set_str += ' fillOpacity: ';
                    set_str += JXG.Options.opacityLevel + ', name: \'\', hasInnerPoints:' + JXG.Options.polygon.hasInnerPoints;
                    set_str += ', snaptogrid: ' + JXG.Options.elements.snapToGrid;
                    set_str += ', snaptopoints: ' + JXG.Options.elements.snapToPoints + ', scalable:true>>; ';
                    break;

                case JXG.GENTYPE_TEXT:
                    set_str = assign + 'text(' + pn(step.args.x) + ', ' + pn(step.args.y) + ', ' + step.args.str + ') <<';
                    set_str += attrid + 'name: \'' + step.dest_id + '\'';
                    if (typeof step.args.anchor != 'undefined') {
                        set_str += ', anchor: ' + step.args.anchor;
                    }
                    set_str += '>>; ' + step.dest_id + '.setText(' + step.args.str;
                    set_str += '); ';
                    reset_str = 'delete ' + step.dest_id + '; ';
                    break;

                case JXG.GENTYPE_RULER:
                    set_str = assign + 'tapemeasure([ ' + step.args.p1 + ' ], [ ' + step.args.p2 + ' ]) <<';
                    /*
                     set_str += attrid + 'name: \'\', point1: <<id: \'' + step.dest_sub_ids[0] + '\', snaptogrid: '
                     + JXG.Options.elements.snapToGrid + ', snaptopoints: ' + JXG.Options.elements.snapToPoints + '>>, '
                     + 'point2: <<id: \'' + step.dest_sub_ids[1] + '\''+ ', snaptogrid: '
                     + JXG.Options.elements.snapToGrid + ', snaptopoints: ' + JXG.Options.elements.snapToPoints + '>> >>; ';
                     */
                    set_str += attrid + 'name: \'\', point1: <<id: \'' + step.dest_sub_ids[0] + '\', snaptogrid: '
                        + JXG.Options.elements.snapToGrid + '>>, '
                        + 'point2: <<id: \'' + step.dest_sub_ids[1] + '\'' + ', snaptogrid: '
                        + JXG.Options.elements.snapToGrid + '>> >>; ';
                    reset_str = 'delete ' + step.dest_id + '; ';
                    break;

                case JXG.GENTYPE_POLYGON:
                    set_str = assign + 'polygon(';

                    for (i = 0; i < step.src_ids.length; i++) {
                        set_str += step.src_ids[i];
                        if (i !== step.src_ids.length - 1) {
                            set_str += ', ';
                        }
                    }

                    set_str += ') <<borders: <<ids: [ \'';

                    for (i = 0; i < step.dest_sub_ids.length; i++) {
                        set_str += step.dest_sub_ids[i];
                        if (i < step.dest_sub_ids.length - 1) {
                            set_str += '\', \'';
                        }
                    }

                    set_str += '\' ], name: \'\'>>, ' + attrid + ' fillOpacity: ' + JXG.Options.opacityLevel + ', name: \'\'>>; ';
                    reset_str = 'delete ' + step.dest_id + '; ';
                    break;

                case JXG.GENTYPE_REGULARPOLYGON:
                    set_str = assign + 'regularpolygon(' + step.src_ids[0] + ', ' + step.src_ids[1] + ', ';
                    set_str += step.args.corners + ') <<borders: <<ids: [ ';

                    for (i = 0; i < step.args.corners; i++) {
                        set_str += '\'' + step.dest_sub_ids[i] + '\'';
                        if (i !== step.args.corners - 1) {
                            set_str += ', ';
                        }
                        reset_str = 'delete ' + step.dest_sub_ids[i] + '; ' + reset_str;
                    }

                    set_str += ' ]>>, vertices: <<ids: [ ';

                    for (i = 0; i < step.args.corners - 2; i++) {
                        set_str += '\'' + step.dest_sub_ids[i + parseInt(step.args.corners, 10)] + '\'';
                        if (i !== step.args.corners - 3) {
                            set_str += ', ';
                        }
                        reset_str = 'delete ' + step.dest_sub_ids[i + parseInt(step.args.corners, 10)] + '; ' + reset_str;
                    }

                    set_str += ' ]>>, ' + attrid + ' fillOpacity: ' + JXG.Options.opacityLevel + ', name: \'\'>>; ';
                    reset_str = 'delete ' + step.dest_id + '; ' + reset_str;
                    break;

                case JXG.GENTYPE_SECTOR:
                    // set_str = assign + 'sector(' + step.src_ids[0] + ', ' + step.src_ids[1] + ', ' + step.src_ids[2];
                    // set_str += ') <<';
                    set_str = assign + 'sector(' + step.src_ids.join(', ') + ') ';
                    set_str += '<< ';
                    set_str += attrid + ' name: \'' + step.dest_id + '\', fillOpacity: ' + JXG.Options.opacityLevel;
                    set_str += '>>; ';
                    reset_str = 'delete ' + step.dest_id + '; ';
                    break;

                case JXG.GENTYPE_ANGLE:
                    // set_str = assign + 'angle(' + step.src_ids[0] + ', ' + step.src_ids[1] + ', ' + step.src_ids[2] + ') ';
                    set_str = assign + 'angle(' + step.src_ids.join(', ') + ') ';
                    set_str += '<< ';
                    set_str += 'dot: << priv:true, id: \'' + step.dest_sub_ids[0] + '\', name: \'' + step.dest_sub_ids[0] + '\'>>, ';
                    set_str += attrid + ' fillOpacity: ' + JXG.Options.opacityLevel + ' >>; ';
                    reset_str = 'delete ' + step.dest_id + '; ';
                    reset_str += 'delete ' + step.dest_sub_ids[0] + '; ';
                    break;

                case JXG.GENTYPE_PLOT:

                    set_str = assign + step.args.plot_type + '(' + step.args.func;

                    if (isNaN(step.args.a) || step.args.a == null)
                        step.args.a = "-infinity";
                    if (isNaN(step.args.b) || step.args.b == null)
                        step.args.b = "infinity";

                    if (step.args.a != step.args.b)
                        set_str += ', ' + step.args.a + ', ' + step.args.b;

                    set_str += ') <<';

                    if (step.args.isPolar)
                        set_str += 'curveType: \'polar\', ';

                    set_str += attrid + 'name: \'' + step.dest_id + '\', strokeColor: \'' + step.args.color + '\'>>; ';
                    reset_str = 'delete ' + step.dest_id + '; ';

                    break;

                case JXG.GENTYPE_SLOPETRIANGLE:
                    set_str = assign + 'slopetriangle(' + step.args.tangent + ') <<id: \'' + step.dest_id + '\', name: \'\'>>; ';
                    reset_str = 'delete ' + step.dest_id + '; ';
                    break;

                case JXG.GENTYPE_SLIDER:
                    set_str = assign + 'slider([' + pn(step.args.x1) + ', ' + pn(step.args.y1) + '], [' + pn(step.args.x2);
                    set_str += ', ' + pn(step.args.y2) + '], [' + pn(step.args.start) + ', ' + pn(step.args.ini) + ', ';
                    set_str += pn(step.args.end) + ']) <<' + attrid + 'baseline: <<id: \'';
                    set_str += step.dest_sub_ids[0] + '\', name: \'' + step.dest_sub_ids[0] + '\'>>, highline: <<id: \'';
                    set_str += step.dest_sub_ids[1] + '\', name: \'' + step.dest_sub_ids[1] + '\'>>, point1: <<id: \'';
                    set_str += step.dest_sub_ids[2] + '\', name: \'' + step.dest_sub_ids[2] + '\'>>, point2: <<id: \'';
                    set_str += step.dest_sub_ids[3] + '\', name: \'' + step.dest_sub_ids[3] + '\'>>, label: <<id: \'';
                    set_str += step.dest_sub_ids[4] + '\', name: \'' + step.dest_sub_ids[4] + '\'>>>>; ';

                    reset_str = 'delete ' + step.dest_id + '; delete ' + step.dest_sub_ids[4] + '; delete ';
                    reset_str += step.dest_sub_ids[3] + '; delete ' + step.dest_sub_ids[2] + '; delete ';
                    reset_str += step.dest_sub_ids[1] + '; delete ';
                    reset_str += step.dest_sub_ids[0] + '; ';
                    break;


                case JXG.GENTYPE_DELETE:

                    arr = [];
                    ctx_set_str = [];
                    ctx_reset_str = [];

                    for (i = 0; i < step.args.steps.length; i++) {
                        if (step_log[step.args.steps[i]].type > 50) {
                            arr = this.generateJCodeMeta(step_log[step.args.steps[i]], board);
                        } else {
                            arr = this.generateJCode(step_log[step.args.steps[i]], board, step_log);
                        }

                        if (JXG.trim(arr[2]) !== '') {
                            set_str = arr[2] + set_str;
                        }
                        if (JXG.isFunction(arr[3])) {
                            ctx_set_str.unshift(arr[3]);
                        }
                        if (JXG.trim(arr[0]) !== '') {
                            reset_str += arr[0];
                        }
                        if (JXG.isFunction(arr[1])) {
                            ctx_reset_str.push(arr[1]);
                        }
                    }

                    break;

                case JXG.GENTYPE_COPY:
                    copy_log = [];

                    // Adapt the steps to the new IDs
                    for (el in step.args.steps) {
                        if (step.args.steps.hasOwnProperty(el)) {
                            step2 = JXG.deepCopy(step_log[step.args.steps[el]]);

                            if (step2.type === JXG.GENTYPE_COPY) {
                                for (i = 0; i < step2.args.map.length; i++) {
                                    for (j = 0; j < step.args.map.length; j++) {
                                        if (step2.args.map[i].copy === step.args.map[j].orig) {
                                            step2.args.map[i].copy = step.args.map[j].copy;
                                        }
                                    }
                                }

                                step2 = JXG.SketchReader.replaceStepDestIds(step2, step2.args.map);
                            } else {
                                step2 = JXG.SketchReader.replaceStepDestIds(step2, step.args.map);
                            }

                            copy_log.push(step2);
                        }
                    }

                    for (i = 0; i < copy_log.length; i++) {
                        if (copy_log[i].type > 50) {
                            arr = this.generateJCodeMeta(copy_log[i], board);
                        } else {
                            arr = this.generateJCode(copy_log[i], board, step_log);
                        }

                        if (JXG.trim(arr[0]) !== '') {
                            set_str += arr[0];
                        }

                        if (JXG.isFunction(arr[1])) {
                            ctx_set_str.push(arr[1]);
                        }

                        if (JXG.trim(arr[2]) !== '') {
                            reset_str = arr[2] + reset_str;
                        }

                        if (JXG.isFunction(arr[3])) {
                            ctx_reset_str.unshift(arr[3]);
                        }
                    }

                    // Apply the offset-translation to the free points of the copy
                    if (step.args.dep_copy) {
                        for (i = 0; i < step.args.map.length; i++) {
                            if (getObject(step.args.map[i].orig).elementClass === JXG.OBJECT_CLASS_POINT) {
                                set_str += step.args.map[i].copy;
                                set_str += '.X = function() { return (' + step.args.map[i].orig + '.X() - ';
                                set_str += pn(step.args.x) + '); }; ';
                                set_str += step.args.map[i].copy;
                                set_str += '.Y = function() { return (' + step.args.map[i].orig + '.Y() - ';
                                set_str += pn(step.args.y) + '); }; ';
                            }
                        }
                    } else {
                        for (i = 0; i < step.args.free_points.length; i++) {
                            xstart = getObject(step.args.free_points[i].orig).coords.usrCoords[1];
                            ystart = getObject(step.args.free_points[i].orig).coords.usrCoords[2];

                            set_str += step.args.free_points[i].copy + '.X = function() { return ';
                            set_str += pn(xstart - step.args.x) + '; }; ';
                            set_str += step.args.free_points[i].copy + '.Y = function() { return ';
                            set_str += pn(ystart - step.args.y) + '; }; ';
                            set_str += step.args.free_points[i].copy + '.free(); ';
                        }
                    }

                    for (j = 0; j < step.args.map.length; j++) {
                        el = getObject(step.args.map[j].orig);

                        // Check if a radius-defined circle should be copied
                        if (el.type === JXG.OBJECT_TYPE_CIRCLE && !JXG.exists(el.point2)) {
                            // Make the radius of the circle copy depend on the original circle's radius
                            set_str += step.args.map[j].copy + '.setRadius(function () { return ';
                            set_str += step.args.map[j].orig + '.radius(); }); ';
                        }
                    }

                    break;

                case JXG.GENTYPE_ABLATION:

                    xstart = getObject(step.src_ids[0]).coords.usrCoords[1];
                    ystart = getObject(step.src_ids[0]).coords.usrCoords[2];

                    set_str = 'point(' + pn(xstart - step.args.x) + ', ' + pn(ystart - step.args.y) + ') <<id: \'';
                    set_str += step.dest_sub_ids[0] + '\', withLabel: false>>; ';
                    set_str += 'circle(\'' + step.dest_sub_ids[0] + '\', 1) <<id: \'' + step.dest_sub_ids[1];
                    set_str += '\', fillOpacity: ' + JXG.Options.opacityLevel + ', strokeColor: \'#888888\', visible: true>>; ';

                    if (step.args.fids.length === 1) {
                        step.args.func = step.args.fids[0] + '.radius()';
                    } else {
                        step.args.func = 'dist(' + step.args.fids[0] + ', ' + step.args.fids[1] + ')';
                    }

                    set_str += step.dest_sub_ids[1] + '.setRadius(function() { return ' + step.args.func + '; }); ';

                    if (step.args.migrate !== 0 && step.args.migrate !== -1) {
                        set_str += '$board.migratePoint(' + step.dest_sub_ids[0] + ', ' + step.args.migrate + '); ';
                    }

                    reset_str = 'delete ' + step.dest_sub_ids[1] + '; delete ' + step.dest_sub_ids[0] + '; ';

                    break;
/*
                case JXG.GENTYPE_TRANSFORM:

                    set_str = step.dest_sub_ids[0] + ' = transform(' + step.args.tmat + ') <<type: \'generic\'>>; ';
                    set_str += 'point(' + step.src_ids[0] + ', ' + step.dest_sub_ids[0] + ') <<id: \'' + step.dest_id;
                    set_str += '\', visible: true>>; ';

                    reset_str = 'delete ' + step.dest_id + '; ';
                    reset_str += 'delete ' + step.dest_sub_ids[0] + '; ';

                    break;

                case JXG.GENTYPE_PERPENDICULAR_BISECTOR:
                    if (step.args.create_line) {
                        sub_id = step.dest_sub_ids[2];
                        set_str = 'line(' + step.src_ids[0] + ', ' + step.src_ids[1] + ') <<id: \'' + sub_id;
                        set_str += '\', visible: true>>; ';
                        reset_str = 'delete ' + sub_id + '; ';
                    } else {
                        sub_id = step.src_ids[2];
                    }

                    set_str += 'midpoint(' + step.src_ids[0] + ', ' + step.src_ids[1] + ') <<id: \'' + step.dest_sub_ids[0];
                    set_str += '\', fillColor: \'' + step.args.fillColor + '\'>>; ';
                    set_str += assign + 'normal(' + step.dest_sub_ids[0] + ', ' + sub_id + ') <<' + attrid;
                    set_str += ' point: <<id: \'' + step.dest_sub_ids[1] + '\', name: \'' + step.dest_sub_ids[1];
                    set_str += '\'>> >>; ';
                    reset_str = 'delete ' + step.dest_sub_ids[0] + '; ' + reset_str;
                    reset_str = 'delete ' + step.dest_id + '; delete ' + step.dest_sub_ids[1] + '; ' + reset_str;
                    break;
*/
                case JXG.GENTYPE_MOVEMENT:

                    if (step.args.obj_type === JXG.OBJECT_TYPE_LINE) {
                        set_str = step.src_ids[0] + '.move([' + pn(step.args.coords[0].usrCoords[0]) + ', ';
                        set_str += pn(step.args.coords[0].usrCoords[1]) + ', ' + pn(step.args.coords[0].usrCoords[2]) + ']); ';
                        reset_str = step.src_ids[0] + '.move([' + step.args.zstart[0] + ', ' + step.args.xstart[0] + ', ';
                        reset_str += step.args.ystart[0] + ']); ';

                        set_str += step.src_ids[1] + '.move([' + pn(step.args.coords[1].usrCoords[0]) + ', ';
                        set_str += pn(step.args.coords[1].usrCoords[1]) + ', ' + pn(step.args.coords[1].usrCoords[2]) + ']); ';
                        reset_str += step.src_ids[1] + '.move([' + step.args.zstart[1] + ', ' + step.args.xstart[1] + ', ';
                        reset_str += step.args.ystart[1] + ']); ';

                    } else if (step.args.obj_type === JXG.OBJECT_TYPE_CIRCLE) {
                        set_str = step.src_ids[0] + '.move([' + pn(step.args.coords[0].usrCoords[1]) + ', ';
                        set_str += pn(step.args.coords[0].usrCoords[2]) + ']); ';
                        reset_str = step.src_ids[0] + '.move([' + step.args.xstart + ', ' + step.args.ystart + ']); ';

                        if (step.args.has_point2) {
                            set_str += step.src_ids[1] + '.move([' + pn(step.args.coords[1].usrCoords[1]) + ', ';
                            set_str += pn(step.args.coords[1].usrCoords[2]) + ']); ';
                            reset_str += step.src_ids[1] + '.move([' + step.args.old_p2x + ', ' + step.args.old_p2y;
                            reset_str += ']); ';
                        }

                    } else if (step.args.obj_type === JXG.OBJECT_TYPE_POLYGON) {
                        set_str = reset_str = "";

                        for (i = 0; i < step.src_ids.length; i++) {
                            set_str += step.src_ids[i] + '.move([' + pn(step.args.coords[i].usrCoords[1]) + ', ';
                            set_str += pn(step.args.coords[i].usrCoords[2]) + ']); ';
                            reset_str += step.src_ids[i] + '.move([' + step.args.xstart[i] + ', ' + step.args.ystart[i];
                            reset_str += ']); ';
                        }

                    } else {
                        set_str = step.src_ids[0] + '.move([' + pn(step.args.coords[0].usrCoords[1]) + ', ';
                        set_str += pn(step.args.coords[0].usrCoords[2]) + ']); ';

                        reset_str = step.src_ids[0] + '.move([' + step.args.xstart + ', ' + step.args.ystart + ']); ';
                    }

                    break;

                default:
                    JXG.debug("No such GENTYPE!" + step.type);
                    return [];
            }

            return [set_str, ctx_set_str, reset_str, ctx_reset_str];
        },

        replaceStepDestIds: function (step, id_map) {
            var i, j, copy_ids = [];

            for (i = 0; i < id_map.length; i++) {
                copy_ids.push(id_map[i].copy);

                if (step.dest_id === id_map[i].orig) {
                    step.dest_id = id_map[i].copy;
                }

                for (j = 0; j < step.dest_sub_ids.length; j++) {
                    if (step.dest_sub_ids[j] === id_map[i].orig) {
                        step.dest_sub_ids[j] = id_map[i].copy;
                    }
                }

                for (j = 0; j < step.src_ids.length; j++) {
                    if (step.src_ids[j] === id_map[i].orig) {
                        step.src_ids[j] = id_map[i].copy;
                    }
                }
            }

            for (j = 0; j < step.dest_sub_ids.length; j++) {
                if (!JXG.isInArray(copy_ids, step.dest_sub_ids[j])) {
                    step.dest_sub_ids[j] = this.id();
                }
            }

            step.src_ids = JXG.uniqueArray(step.src_ids);
            step.dest_sub_ids = JXG.uniqueArray(step.dest_sub_ids);

            return step;
        }
    });

    JXG.registerReader(JXG.SketchReader, ['sketch', 'sketchometry']);
}());
