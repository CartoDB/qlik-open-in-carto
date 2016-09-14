/*
 * This extension creates a "Open in CARTO" button that can be used to send the contents of the hypercube, taking into account active filters, to CARTO.
 */
define(["./config", "text!./open_in_carto.css"], function (config, css) {
    $("<style>").html(css).appendTo("head");

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
            var url = "https://" + layout.account + ".carto.com/api/v2/sql/?api_key=" + layout.APIKey;

            var sendData = function (lastRow) {
                var sqlValues = "";

                // Take every row and add it to the insert statement
                // TODO: maybe insert in chunks instead of all together? (not trivial, though)
                paintObj.backendApi.eachDataRow(function (rowNum, row) {
                    var sqlColumns = "";

                    $.each(row, function (idx, column) {
                        var lonlat;

                        if (sqlColumns) {
                            sqlColumns += ",";
                        }

                        var dataType = layout.qHyperCube.qDimensionInfo[idx].qTags[0];
                        if (dataType == "$geopoint") {
                            lonlat = JSON.parse(column.qText);
                            sqlColumns += lonlat[1] + "," + lonlat[0];
                        } else {
                            sqlColumns += column.qText;
                        }
                    });

                    sqlValues += "(" + sqlColumns + "),";
                });

                $.post(url, {q: "INSERT INTO " + layout.tableName + " VALUES " + sqlValues.slice(0, -1)})
                .done(function () {
                    $.post(url, {q: "SELECT cdb_cartodbfytable('" + layout.account + "', '" + layout.tableName + "'); UPDATE " + layout.tableName + " SET the_geom=ST_SetSRID(ST_MakePoint(longitude, latitude),4326);"})
                    .done(function () {
                        status = IDLE;
                        $("#open_in_carto").text("Success");
                    })
                    .fail(function () {
                        $.post(url, {q: "SELECT cdb_cartodbfytable('" + layout.tableName + "'); UPDATE " + layout.tableName + " SET the_geom=ST_SetSRID(ST_MakePoint(longitude, latitude),4326);"})
                        .done(function () {
                            status = IDLE;
                            $("#open_in_carto").text("Success");
                        })
                        .fail(function () {
                            status = IDLE;
                            $("#open_in_carto").text("Retry");
                        });
                    });
                })
                .fail(function () {
                    status = IDLE;
                    $("#open_in_carto").text("Retry");
                });
            };

            if (status == IDLE) {
                $element.html('<button id="open_in_carto">Open in CARTO</button>');
            }

            $("#open_in_carto").off("click");  // Avoid multiple events on repainting
            $("#open_in_carto").on("click", function () {
                status = SENDING;
                $("#open_in_carto").text("Sending...");

                $.post(url, {q: "DROP TABLE IF EXISTS " + layout.tableName + " CASCADE"})
                .done(function () {
                    // CREATE statement, will look into dimensions to get column names and types
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

                    $.post(url, {q: sqlQuery})
                    .done(function () {
                        sendData();
                    })
                    .fail(function () {
                        status = IDLE;
                        $("#open_in_carto").text("Retry");
                    });
                })
                .fail(function () {
                    status = IDLE;
                    $("#open_in_carto").text("Retry");
                });
            });
        }
    };
});
