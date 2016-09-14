define(function () {
    return {
        getSettings: function () {
            return {
                uses: "settings",
                items: {
                    cartodb: {
                        type: "items",
                        label: "CartoDB settings",
                        items: {
                            account: {
                                ref: "account",
                                type: "string",
                                label: "CartoDB user name",
                                defaultValue: ""
                            },
                            APIKey: {
                                ref: "APIKey",
                                type: "string",
                                label: "CartoDB API key",
                                defaultValue: ""
                            },
                            tableName: {
                                ref: "tableName",
                                type: "string",
                                label: "CartoDB dataset name",
                                defaultValue: ""
                            }
                        }
                    }
                }
            }
        }
    }
});