/**
 * @file tap.js
 *
 * This project is forked from fastclick.
 * @see https://github.com/ftlabs/fastclick
 * @copyright The Financial Times Limited [All Rights Reserved]
 * @license MIT License
 */

define(function (require) {
    'use strict';

    var bind = require('saber-lang/bind');

    var UA = navigator.userAgent;

    /**
     * Android requires exceptions.
     *
     * @type {boolean}
     */
    var isAndroid = UA.indexOf('Android') > 0;

    /**
     * iOS requires exceptions.
     *
     * @type {boolean}
     */
    var isIOS = /iP(ad|hone|od)/.test(UA);

    /**
     * iOS 4 requires an exception for select elements.
     *
     * @type {boolean}
     */
    var isIOS4 = isIOS && (/OS 4_\d(_\d)?/).test(UA);

    /**
     * iOS 6.0(+?) requires the target element to be manually derived
     *
     * @type {boolean}
     */
    var isIOSWithBadTarget = isIOS && (/OS ([6-9]|\d{2})_\d/).test(UA);


    /**
     * Chrome Core requires exceptions.
     *
     * @desc Chrome Core, exclude iOS Chrome (CriOS)
     * @type {boolean}
     */
    var isChromeCore = 'chrome' in window;

    /**
     * UC Browser requires exceptions.
     *
     * @type {boolean}
     */
    var isUC = UA.indexOf('UCBrowser') > 0;


    /**
     * Check whether Tap is needed.
     *
     * @return {boolean}
     */
    function notNeeded() {
        // devices that don't support touch don't need Tap
        if (!('ontouchstart' in window)) {
            return true;
        }

        // Chrome Core && Android UCBrowser doesn't need Tap
        if (isChromeCore || (isAndroid && isUC)) {
            return true;
        }

        return false;
    }

    /**
     * fix old onClick handler
     *
     * If a handler is already declared in the element's onclick attribute,
     * it will be fired before Tap's onClick handler. Fix this by pulling out
     * the user-defined handler function and adding it as listener.
     *
     * @param {HTMLElement} layer The layer to listen on
     */
    function fixOldOnClick(layer) {
        // Android browser on at least 3.2 requires a new reference
        // to the function in layer.onclick.
        // the old one won't work if passed to addEventListener directly.
        var oldOnClick = layer.onclick;

        // @todo 执行该修复操作后，可能导致 layer.onclick 对应解绑事件的方法失效
        layer.addEventListener('click', function (event) {
            oldOnClick(event);
        }, false);
        layer.onclick = null;
    }


    /**
     * Instantiate clicking listeners on specificed layer.
     *
     * @constructor
     * @param {HTMLElement} layer The layer to listen on
     */
    function Tap(layer) {
        this.layer = layer;

        // Whether a click is currently being tracked.
        this.trackingClick = false;

        // Timestamp for when when click tracking started.
        this.trackingClickStart = 0;

        // The element being tracked for a click.
        this.targetElement = null;

        // X-coordinate of touch start event.
        this.startX = 0;

        // Y-coordinate of touch start event.
        this.startY = 0;

        // ID of the last touch, retrieved from Touch.identifier.
        this.lastTouchIdentifier = 0;

        // Touchmove boundary, beyond which a click will be cancelled.
        this.boundary = 10;

        if (!layer || !layer.nodeType) {
            throw new TypeError('layer must be a HTMLElement.');
        }

        if (notNeeded()) {
            return;
        }

        // bind context
        this.onClick = bind(this.onClick, this);
        this.onMouse = bind(this.onMouse, this);
        this.onTouchStart = bind(this.onTouchStart, this);
        this.onTouchMove = bind(this.onTouchMove, this);
        this.onTouchEnd = bind(this.onTouchEnd, this);
        this.onTouchCancel = bind(this.onTouchCancel, this);

        this.bindEvents();

        // Hack is required for browsers that don't support
        // Event#stopImmediatePropagation (e.g. Android 2)
        // which is how Tap normally stops click events bubbling to callbacks
        // registered on the Tap layer when they are cancelled.
        if (!Event.prototype.stopImmediatePropagation) {
            layer.addEventListener = function (type, callback, capture) {
                var addEvent = Node.prototype.addEventListener;
                if (type === 'click') {
                    if (!callback.hijacked) {
                        callback.hijacked = function (event) {
                            // event.propagationStopped is a custom property
                            if (!event.propagationStopped) {
                                callback(event);
                            }
                        };
                    }
                    addEvent.call(layer, type, callback.hijacked, capture);
                }
                else {
                    addEvent.call(layer, type, callback, capture);
                }
            };

            layer.removeEventListener = function (type, callback, capture) {
                var removeEvent = Node.prototype.removeEventListener;
                if (type === 'click') {
                    removeEvent.call(
                        layer,
                        type,
                        callback.hijacked || callback,
                        capture
                   );
                }
                else {
                    removeEvent.call(layer, type, callback, capture);
                }
            };
        }

        if (typeof layer.onclick === 'function') {
            fixOldOnClick(layer);
        }
    }

    /**
     * Bind all event listeners.
     */
    Tap.prototype.bindEvents = function () {
        var layer = this.layer;

        if (isAndroid) {
            layer.addEventListener('mouseover', this.onMouse, true);
            layer.addEventListener('mousedown', this.onMouse, true);
            layer.addEventListener('mouseup', this.onMouse, true);
        }

        layer.addEventListener('click', this.onClick, true);
        layer.addEventListener('touchstart', this.onTouchStart, false);
        layer.addEventListener('touchmove', this.onTouchMove, false);
        layer.addEventListener('touchend', this.onTouchEnd, false);
        layer.addEventListener('touchcancel', this.onTouchCancel, false);
    };

    /**
     * Determine mouse events which should be permitted.
     *
     * @param {Event} event
     * @returns {boolean}
     */
    Tap.prototype.onMouse = function (event) {
        // If a target element was never set (because a touch event was
        // never fired) allow the event
        if (!this.targetElement) {
            return true;
        }

        if (event.forwardedTouchEvent) {
            return true;
        }

        // Programmatically generated events targeting a specific element
        // should be permitted
        if (!event.cancelable) {
            return true;
        }

        // Derive and check the target element to see whether the mouse event
        // needs to be permitted;
        // unless explicitly enabled, prevent non-touch click events from
        // triggering actions, to prevent ghost/doubleclicks.
        if (!this.needsClick(this.targetElement) || this.cancelNextClick) {
            // Prevent any user-added listeners declared on Tap element
            // from being fired.
            if (event.stopImmediatePropagation) {
                event.stopImmediatePropagation();
            }
            else {
                // Part of the hack for browsers that don't support
                // Event#stopImmediatePropagation (e.g. Android 2)
                event.propagationStopped = true;
            }

            // Cancel the event
            event.stopPropagation();
            event.preventDefault();

            return false;
        }

        // If the mouse event is permitted, return true for the action
        // to go through.
        return true;
    };

    /**
     * Get target element from eventTarget
     *
     * @param {EventTarget} eventTarget
     * @return {Element|EventTarget}
     */
    Tap.prototype.getTargetElementFromEventTarget = function (eventTarget) {
        // On some older browsers (notably Safari on iOS 4.1) the event target
        // may be a text node.
        if (eventTarget.nodeType === Node.TEXT_NODE) {
            return eventTarget.parentNode;
        }

        return eventTarget;
    };


    /**
     * Check whether the given target element is a child of
     * a scrollable layer and if so, set a flag on it.
     *
     * @param {EventTarget|Element} targetElement
     */
    Tap.prototype.updateScrollParent = function (targetElement) {
        var scrollParent = targetElement.tapScrollParent;

        // Attempt to discover whether the target element is contained
        // within a scrollable layer. Re-check if the target element was
        // moved to another parent.
        if (!scrollParent || !scrollParent.contains(targetElement)) {
            var parentElement = targetElement;

            do {
                if (parentElement.scrollHeight > parentElement.offsetHeight) {
                    scrollParent = parentElement;
                    targetElement.tapScrollParent = parentElement;
                    break;
                }

                parentElement = parentElement.parentElement;
            } while (parentElement);
        }

        // Always update the scroll top tracker if possible.
        if (scrollParent) {
            scrollParent.tapLastScrollTop = scrollParent.scrollTop;
        }
    };

    /**
     * On actual clicks, determine whether this is a touch-generated click,
     * a click action occurring naturally after a delay after a touch
     * (which needs to be cancelled to avoid duplication), or an actual click
     * which should be permitted.
     *
     * @param {Event} event
     * @return {boolean}
     */
    Tap.prototype.onClick = function (event) {
        // It's possible for another Tap-like library delivered with
        // third-party code to fire a click event before Tap does.
        // In that case, set the click-tracking flag back to false and
        // return early. This will cause onTouchEnd to return early.
        if (this.trackingClick) {
            this.targetElement = null;
            this.trackingClick = false;
            return true;
        }

        // Very odd behaviour on iOS: if a submit element is present
        // inside a form and the user hits enter in the iOS simulator
        // or clicks the Go button on the pop-up OS keyboard the a kind of
        // 'fake' click event will be triggered with the submit-type
        // input element as the target.
        if (event.target.type === 'submit' && event.detail === 0) {
            return true;
        }

        var permitted = this.onMouse(event);

        // Only unset targetElement if the click is not permitted.
        // This will ensure that the check for !targetElement in onMouse
        // fails and the browser's click doesn't go through.
        if (!permitted) {
            this.targetElement = null;
        }

        // If clicks are permitted, return true for the action to go through.
        return permitted;
    };

    /**
     * On touch start, record the position and scroll offset.
     *
     * @param {Event} event
     * @return {boolean}
     */
    Tap.prototype.onTouchStart = function (event) {
        // Ignore multiple touches
        if (event.targetTouches.length > 1) {
            return true;
        }

        var target = this.getTargetElementFromEventTarget(event.target);
        var touch = event.targetTouches[0];
        var selection;

        if (isIOS) {
            // Only trusted events will deselect text on iOS
            selection = window.getSelection();
            if (selection.rangeCount && !selection.isCollapsed) {
                return true;
            }

            if (!this.isIOS4) {
                // Weird things happen on iOS when an alert or confirm dialog
                // is opened from a click event callback:
                // when the user next taps anywhere else on the page, new
                // touchstart and touchend events are dispatched with the same
                // identifier as the touch event that previously triggered the
                // click that triggered the alert.
                // Sadly, there is an issue on iOS 4 that causes some normal
                // touch events to have the same identifier as an immediately
                // proceeding touch event, so this fix is unavailable on that
                // platform.
                if (touch.identifier === this.lastTouchIdentifier) {
                    event.preventDefault();
                    return false;
                }

                this.lastTouchIdentifier = touch.identifier;

                // If the target element is a child of a scrollable layer
                // (using -webkit-overflow-scrolling: touch) and:
                // 1) the user does a fling scroll on the scrollable layer
                // 2) the user stops the fling scroll with another tap
                // then the event.target of the last 'touchend' event will be
                // the element that was under the user's finger when the fling
                // scroll was started, causing Tap to send a click event to
                // that layer - unless a check is made to ensure that a parent
                // layer was not scrolled before sending a synthetic click.
                this.updateScrollParent(target);
            }
        }

        this.trackingClick = true;
        this.trackingClickStart = event.timeStamp;
        this.targetElement = target;

        this.startX = touch.pageX;
        this.startY = touch.pageY;

        // Prevent phantom clicks on fast double-tap
        if ((event.timeStamp - this.lastClickTime) < 200) {
            event.preventDefault();
        }

        return true;
    };

    /**
     * Based on a touchmove event object,
     * check whether the touch has moved past a boundary since it started.
     *
     * @param {Event} event
     * @return {boolean}
     */
    Tap.prototype.touchHasMoved = function (event) {
        var touch = event.changedTouches[0];
        var boundary = this.boundary;

        if (Math.abs(touch.pageX - this.startX) > boundary
            || Math.abs(touch.pageY - this.startY) > boundary
       ) {
            return true;
        }

        return false;
    };

    /**
     * Update the last position
     *
     * @param {Event} event
     * @return {boolean}
     */
    Tap.prototype.onTouchMove = function (event) {
        if (!this.trackingClick) {
            return true;
        }

        // If the touch has moved, cancel the click tracking
        var target = this.getTargetElementFromEventTarget(event.target);
        if (this.targetElement !== target || this.touchHasMoved(event)) {
            this.trackingClick = false;
            this.targetElement = null;
        }

        return true;
    };

    /**
     * Attempt to find the labelled control for the given label element.
     *
     * @param {EventTarget|HTMLLabelElement} labelElement
     * @return {Element|null}
     *
     * @todo: 测试label.control,label.htmlFor的支持情况
     */
    Tap.prototype.findControl = function (labelElement) {
        // Fast path for newer browsers supporting the HTML5 control attribute
        if (labelElement.control !== undefined) {
            return labelElement.control;
        }

        // All browsers under test that support touch events also support
        // the HTML5 htmlFor attribute
        if (labelElement.htmlFor) {
            return document.getElementById(labelElement.htmlFor);
        }

        // If no for attribute exists, attempt to retrieve the first
        // labellable descendant element the list of which is defined here:
        // http://www.w3.org/TR/html5/forms.html#category-label
        return labelElement.querySelector(
            'button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea'
       );
    };

    /**
     * @param {EventTarget|Element} targetElement
     */
    Tap.prototype.focus = function (targetElement) {
        // on iOS 7, some input elements (e.g. date datetime) throw a vague
        // TypeError on setSelectionRange. These elements don't have an
        // integer value for the selectionStart and selectionEnd properties,
        // but unfortunately that can't be used for detection because
        // accessing the properties also throws a TypeError. Just check the
        // type instead.
        if (isIOS
            && targetElement.setSelectionRange
            && targetElement.type.indexOf('date') !== 0
            && targetElement.type !== 'time'
       ) {
            var length = targetElement.value.length;
            targetElement.setSelectionRange(length, length);
        }
        else {
            targetElement.focus();
        }
    };

    /**
     * Determine whether a given element requires a call to focus
     * to simulate click into element.
     *
     * @param {EventTarget|Element} target Target DOM element
     * @return {boolean} Returns true if the element requires a call to
     *                   focus to simulate native click.
     */
    Tap.prototype.needsFocus = function (target) {
        switch (target.nodeName.toLowerCase()) {
            case 'textarea':
                return true;
            case 'select':
                return !isAndroid;
            case 'input':
                switch (target.type) {
                    case 'button':
                    case 'checkbox':
                    case 'file':
                    case 'image':
                    case 'radio':
                    case 'submit':
                        return false;
                }
                // No point in attempting to focus disabled inputs
                return !target.disabled && !target.readOnly;
            default:
                return (/\bneedsfocus\b/).test(target.className);
        }
    };

    /**
     * Determine whether a given element requires a native click.
     *
     * @param {EventTarget|Element} target Target DOM element
     * @return {boolean} Returns true if the element needs a native click
     */
    Tap.prototype.needsClick = function (target) {
        switch (target.nodeName.toLowerCase()) {
            // Don't send a synthetic click to disabled inputs
            case 'button':
            case 'select':
            case 'textarea':
                if (target.disabled) {
                    return true;
                }
                break;
            case 'input':
                // File inputs need real clicks on iOS 6 due to a browser bug
                if ((isIOS && target.type === 'file') || target.disabled) {
                    return true;
                }
                break;
            case 'label':
            case 'video':
                return true;
        }

        return (/\bneedsclick\b/).test(target.className);
    };

    /**
     * Send a click event to the specified element.
     *
     * @param {EventTarget|Element} targetElement
     * @param {Event} event
     */
    Tap.prototype.sendClick = function (targetElement, event) {
        // On some Android devices activeElement needs to be blurred
        // otherwise the synthetic click will have no effect
        if (document.activeElement
            && document.activeElement !== targetElement
       ) {
            document.activeElement.blur();
        }

        var touch = event.changedTouches[0];

        // Synthesise a click event, with an extra attribute
        // so it can be tracked
        var clickEvent = document.createEvent('MouseEvents');
        clickEvent.initMouseEvent(
            this.determineEventType(targetElement),
            true,
            true,
            window,
            1,
            touch.screenX,
            touch.screenY,
            touch.clientX,
            touch.clientY,
            false,
            false,
            false,
            false,
            0,
            null
       );
        clickEvent.forwardedTouchEvent = true;
        targetElement.dispatchEvent(clickEvent);
    };

    Tap.prototype.determineEventType = function (targetElement) {
        // Android Chrome Select Box does not open with a synthetic click event
        if (isAndroid && targetElement.tagName.toLowerCase() === 'select') {
            return 'mousedown';
        }

        return 'click';
    };

    /**
     * On touch end, determine whether to send a click event at once.
     *
     * @param {Event} event
     * @return {boolean}
     */
    Tap.prototype.onTouchEnd = function (event) {
        var targetElement = this.targetElement;

        if (!this.trackingClick) {
            return true;
        }

        // Prevent phantom clicks on fast double-tap
        if ((event.timeStamp - this.lastClickTime) < 200) {
            this.cancelNextClick = true;
            return true;
        }

        // Reset to prevent wrong click cancel on input
        this.cancelNextClick = false;

        this.lastClickTime = event.timeStamp;

        var trackingClickStart = this.trackingClickStart;
        this.trackingClick = false;
        this.trackingClickStart = 0;

        // On some iOS devices, the targetElement supplied with the event
        // is invalid if the layer is performing a transition or scroll,
        // and has to be re-detected manually. Note that for this to function
        // correctly, it must be called *after* the event target is checked!
        if (isIOSWithBadTarget) {
            var touch = event.changedTouches[0];

            // In certain cases arguments of elementFromPoint can be negative,
            // so prevent setting targetElement to null
            targetElement = document.elementFromPoint(
                touch.pageX - window.pageXOffset,
                touch.pageY - window.pageYOffset
           ) || targetElement;
            targetElement.tapScrollParent = this.targetElement.tapScrollParent;
        }

        var targetTagName = targetElement.tagName.toLowerCase();
        if (targetTagName === 'label') {
            var forElement = this.findControl(targetElement);
            if (forElement) {
                this.focus(targetElement);
                // @todo: why?
                if (isAndroid) {
                    return false;
                }

                targetElement = forElement;
            }
        }
        else if (this.needsFocus(targetElement)) {
            // Case 1: If the touch started a while ago (best guess is 100ms)
            // then focus will be triggered anyway. Return early and unset the
            // target element reference so that the subsequent click will
            // be allowed through.
            // Case 2: Without this exception for input elements tapped when
            // the document is contained in an iframe, then any inputted text
            // won't be visible even though the value attribute is updated as
            // the user types.
            if (event.timeStamp - trackingClickStart > 100
                || (isIOS
                    && window.top !== window
                    && targetTagName === 'input'
               )
           ) {
                this.targetElement = null;
                return false;
            }

            this.focus(targetElement);

            // Select elements need the event to go through on iOS 4,
            // otherwise the selector menu won't open.
            if (!isIOS4 || targetTagName !== 'select') {
                this.targetElement = null;
                event.preventDefault();
            }

            return false;
        }

        if (isIOS && !isIOS4) {
            // Don't send a synthetic click event if the target element is
            // contained within a parent layer that was scrolled and this
            // tap is being used to stop the scrolling (usually initiated
            // by a fling).
            var scrollParent = targetElement.tapScrollParent;
            if (scrollParent
                && scrollParent.tapLastScrollTop !== scrollParent.scrollTop
           ) {
                return true;
            }
        }

        // Prevent the actual click from going though - unless the target
        // node is marked as requiring real clicks or if it is in the
        // whitelist in which case only non-programmatic clicks are
        // permitted.
        if (!this.needsClick(targetElement)) {
            event.preventDefault();
            this.sendClick(targetElement, event);
        }

        return false;
    };


    /**
     * On touch cancel, stop tracking the click.
     */
    Tap.prototype.onTouchCancel = function () {
        this.trackingClick = false;
        this.targetElement = null;
    };

    /**
     * Remove all event listeners.
     */
    Tap.prototype.destroy = function () {
        var layer = this.layer;

        if (isAndroid) {
            layer.removeEventListener('mouseover', this.onMouse, true);
            layer.removeEventListener('mousedown', this.onMouse, true);
            layer.removeEventListener('mouseup', this.onMouse, true);
        }

        layer.removeEventListener('click', this.onClick, true);
        layer.removeEventListener('touchstart', this.onTouchStart, false);
        layer.removeEventListener('touchmove', this.onTouchMove, false);
        layer.removeEventListener('touchend', this.onTouchEnd, false);
        layer.removeEventListener('touchcancel', this.onTouchCancel, false);
    };

    /**
     * Factory method for creating a Tap object
     *
     * @param {HTMLElement|string} layer The layer to listen on
     * @return {Tap}
     */
    Tap.mixin = function (layer) {
        if (typeof layer === 'string') {
            layer = document.getElementById(layer);
        }

        return new Tap(layer);
    };

    return Tap;

});
