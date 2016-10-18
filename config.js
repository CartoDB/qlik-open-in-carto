define(function () {
    return {
        getSettings: function () {
            return {
                uses: "settings",
                items: {
                    account: {
                        type: "items",
                        label: "Account settings",
                        items: {
                            account: {
                                ref: "account",
                                type: "string",
                                label: "User name",
                                defaultValue: ""
                            },
                            APIKey: {
                                ref: "APIKey",
                                type: "string",
                                label: "API key",
                                defaultValue: ""
                            },
                            tableName: {
                                ref: "tableName",
                                type: "string",
                                label: "Dataset name",
                                defaultValue: ""
                            }
                        }
                    },
                    viz: {
                        type: "items",
                        label: "Visualization settings",
                        items: {
                            viz: {
                                ref: "url",
                                type: "string",
                                label: "Visualization embed URL",
                                defaultValue: ""
                            }
                        }
                    }
                }
            };
        }
    };
});
