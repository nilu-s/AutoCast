'use strict';

(function (root) {
    function bootstrapPanelApp(options) {
        options = options || {};
        var controllerFactory = root.AutoCastPanelController;
        if (!controllerFactory || typeof controllerFactory.create !== 'function') {
            return null;
        }

        var controller = controllerFactory.create(options);
        var runtime = null;
        if (controller && typeof controller.start === 'function') {
            runtime = controller.start();
        }

        return {
            controller: controller,
            runtime: runtime || (controller && typeof controller.getRuntime === 'function' ? controller.getRuntime() : null)
        };
    }

    root.AutoCastPanelBootstrap = {
        bootstrap: bootstrapPanelApp
    };
})(this);
