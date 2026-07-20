{
  "targets": [
    {
      "target_name": "clod_mac_ax",
      "sources": ["mac_ax.mm"],
      "include_dirs": ["../../node_modules/node-addon-api"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS", "NAPI_VERSION=8"],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "OTHER_LDFLAGS": ["-framework AppKit"],
            "MACOSX_DEPLOYMENT_TARGET": "11.0"
          }
        }]
      ]
    }
  ]
}
