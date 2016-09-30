/*
 * This extension creates a "Open in CARTO" button that can be used to send the contents of the hypercube, taking into account active filters, to CARTO.
 * It also provides a way to embed a CARTO visualization in Qlik by means of a viz.json
 */
define(["./config", "text!./deep-insights.css", "text!./open_in_carto.css", "./deep-insights.uncompressed"], function (config, css1, css2, carto) {
    $("<style>").html(css1).appendTo("head");
    $("<style>").html(css2).appendTo("head");

    var CHUNK_SIZE = 3000;

    var IDLE = 0;
    var SENDING = 1;
    var status = IDLE;

    var lastRow = 0;

    return {
        initialProperties: {
            version: 0.1,
            qHyperCubeDef: {
                qDimensions: [],
                qMeasures: [],
                qInitialDataFetch: [{
                    qWidth: 0,
                    qHeight: 0  // We don't want an initial data fetch
                }]
            }
        },

        // Property panel
        definition: {
            type: "items",
            component: "accordion",
            items: {
                dimensions: {
                    uses: "dimensions",
                    min: 1  // GeoMakePoint
                },
                settings: config.getSettings()
            }
        },

        // Object rendering
        paint: function ($element, layout) {
            var paintObj = this;

            var requestPage;
            var qHeight;

            // Request all data pages from hypercube
            if (lastRow < paintObj.backendApi.getRowCount() - 1) {
                qHeight = Math.min(CHUNK_SIZE, paintObj.backendApi.getRowCount() - lastRow);
                requestPage = [{
                    qTop: lastRow + 1,
                    qLeft: 0,
                    qWidth: layout.qHyperCube.qDimensionInfo.length,
                    qHeight: qHeight
                }];
                paintObj.backendApi.getData(requestPage).then(function (dataPages) {
                    lastRow += qHeight;
                    paintObj.paint($element, layout);
                });
                return;
            }

            // Code only reachable when all data pages from hypercube have been loaded
            lastRow = 0;

            var sqlUrl = "https://" + layout.account + ".carto.com/api/v2/sql/?api_key=" + layout.APIKey;

            // viz.json's created with the old editor are by default v2, we need to make sure we get v3 from the server
            var vizjsonUrl = layout.url ? layout.url.replace("v2", "v3") : layout.url;

            var sendData = function (newTable) {
                var sqlNames = "";  // Column names
                var sqlValues = "";  // Values statement

                // Take every row and add it to the insert statement
                // TODO: maybe insert in chunks instead of all together? (not trivial, though)
                paintObj.backendApi.eachDataRow(function (rowNum, row) {
                    var sqlColumns = "";  // Temporary holder of the values statement of the current row

                    $.each(row, function (idx, column) {
                        var lonlat;

                        if (sqlColumns) {
                            sqlColumns += ",";
                        }

                        if (rowNum == 1 && sqlNames) {
                            sqlNames += ",";
                        }

                        var dataType = layout.qHyperCube.qDimensionInfo[idx].qTags[0];
                        if (dataType == "$geopoint") {
                            lonlat = JSON.parse(column.qText);
                            if (newTable) {
                                sqlColumns += lonlat[1] + "," + lonlat[0];
                                if (rowNum == 1) {
                                    sqlNames += "latitude,longitude";
                                }
                            } else {
                                // Table has already been cartodbfied, so we need to add the_geom ourselves
                                sqlColumns += "ST_SetSRID(ST_MakePoint(" + lonlat[0] + "," + lonlat[1] + "),4326)," + lonlat[1] + "," + lonlat[0];
                                if (rowNum == 1) {
                                    sqlNames += "the_geom,latitude,longitude";
                                }
                            }
                        } else {
                            if (rowNum == 1) {
                                sqlNames += layout.qHyperCube.qDimensionInfo[idx].qFallbackTitle;
                            }
                            sqlColumns += column.qText;
                        }
                    });

                    if (rowNum == 1) {
                        sqlNames = "(" + sqlNames + ")";
                    }

                    sqlValues += "(" + sqlColumns + "),";
                });

                if (newTable) {
                    // If table is new, we need to insert and cartodbfy
                    $.post(sqlUrl, {q: "INSERT INTO " + layout.tableName + " VALUES " + sqlValues.slice(0, -1)})
                    .done(function () {
                        // Try with org user
                        $.post(sqlUrl, {q: "SELECT cdb_cartodbfytable('" + layout.account + "', '" + layout.tableName + "'); UPDATE " + layout.tableName + " SET the_geom=ST_SetSRID(ST_MakePoint(longitude, latitude),4326);"})
                        .done(function () {
                            status = IDLE;
                            $("#open_in_carto").text("Success");
                        })
                        .fail(function () {
                            // Not an org user
                            $.post(sqlUrl, {q: "SELECT cdb_cartodbfytable('" + layout.tableName + "'); UPDATE " + layout.tableName + " SET the_geom=ST_SetSRID(ST_MakePoint(longitude, latitude),4326);"})
                            .done(function () {
                                status = IDLE;
                                $("#open_in_carto").text("Success");
                                if (vizjsonUrl) {
                                    carto.deepInsights.createDashboard('#dashboard', vizjsonUrl);
                                }
                            })
                            .fail(function () {
                                // Cartodbfy failed
                                status = IDLE;
                                $("#open_in_carto").text("Retry");
                            });
                        });
                    })
                    .fail(function () {
                        // Insert query failed
                        status = IDLE;
                        $("#open_in_carto").text("Retry");
                    });
                } else {
                    // If the table already existed, we don't need to cartodbfy, just insert right away
                    $.post(sqlUrl, {q: "INSERT INTO " + layout.tableName + " " + sqlNames + " VALUES " + sqlValues.slice(0, -1)})
                    .done(function () {
                        status = IDLE;
                        $("#open_in_carto").addClass("ButtonCarto--confirm");
                        $("#open_in_carto").html('<span class="ButtonCarto-text">SUCCESS</span></button>');
                    })
                    .fail(function () {
                        status = IDLE;
                        $("#open_in_carto").addClass("ButtonCarto--confirm");
                        $("#open_in_carto").html('<span class="ButtonCarto-text">RETRY</span></button>');
                    });
                }
            };

            var populateTable = function (newTable) {
                // CREATE statement, will look into dimensions to get column names and types
                if (newTable) {
                    var sqlQuery = "CREATE TABLE " + layout.tableName + " (";
                    var sqlColumns = "";
                    $.each(layout.qHyperCube.qDimensionInfo, function (idx, dimension) {
                        var dataType = dimension.qTags[0];
                        if (dataType == "$geopoint") {
                            sqlColumns += "latitude double precision,longitude double precision,";
                        } else if (dataType == "$numeric") {
                            sqlColumns += dimension.qFallbackTitle + " numeric,";
                        } else {
                            sqlColumns += dimension.qFallbackTitle + " text,";
                        }
                    });
                    sqlQuery += sqlColumns.slice(0, -1) + ")";

                    $.post(sqlUrl, {q: sqlQuery})
                    .done(function () {
                        sendData(newTable);
                    })
                    .fail(function () {
                        status = IDLE;
                        $("#open_in_carto").addClass("ButtonCarto--confirm");
                        $("#open_in_carto").html('<span class="ButtonCarto-text">RETRY</span></button>');
                    });
                } else {
                    sendData(newTable);
                }
            };

            if (status == IDLE) {
                var html = '';
                if (layout.account && layout.APIKey && layout.tableName) {
                    html += '<button id="open_in_carto" class="ButtonCarto"><svg class="ButtonCarto-media" width="24px" height="24px" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><g id="logo" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd"><circle id="Oval-80" fill="#FFFFFF" opacity="0.25" cx="12" cy="12" r="12"></circle><circle id="CARTO" fill="#FFFFFF" cx="12" cy="12" r="4"></circle></g></svg><span class="ButtonCarto-text">Open in CARTO</span></button>' + html;
                }
                if (vizjsonUrl) {
                    html += '<div id="dashboard" style="width: 100%; height: 80%"></div>';
                }
                $element.html(html);
                if (vizjsonUrl) {
                    carto.deepInsights.createDashboard('#dashboard', vizjsonUrl, {apiKey: layout.APIKey});
                }
            }

            $("#open_in_carto").off("click");  // Avoid multiple events on repainting
            $("#open_in_carto").on("click", function () {
                status = SENDING;
                $("#open_in_carto").addClass("ButtonCarto--confirm");
                $("#open_in_carto").html('<span class="ButtonCarto-text">SENDING</span></button>');

                $.post(sqlUrl, {q: "TRUNCATE TABLE " + layout.tableName})
                .done(function () {
                    // Truncate succeeded, so table doesn't need to be created
                    populateTable(false);
                })
                .fail(function () {
                    // Truncate failed, which most likely means the table doesn't exist and needs to be created
                    populateTable(true);
                });
            });
        }
    };
});
