let SEND_SCROLLED_ONLY_FIRST_TIME = true;
let products = {};
let STEP_CARRITO = 1;
let DATALAYER = false;
let idErrorsCheckout = [
    'error-for-email',
    'error-for-last_name',
    'error-for-address1',
    'error-for-city',
    'error-for-province',
    'error-for-zip',
    'error-for-phone',
];
let idErrorsPayment = [
    'error-for-number',
    'error-for-name',
    'error-for-expiry',
    'error-for-verification_value',
];
let classBindActions = [
    'gtm-product',
    'gtm-action',
    'gtm-add-to-cart-product',
    'gtm-checkout-button',
    'gtm-modify-cart-product',
    'gtm-remove-from-cart',
];
let didScroll = false;
let scrolledCategories = [];
let scrolledProducts = [];
let lastProductScrolled = [];
let ACCEPTED_GDPR = false;

const CHECKOUT_STEP_1 = 'contact_information';
const CHECKOUT_STEP_2 = 'shipping_method';
const CHECKOUT_STEP_3 = 'payment_method';

const DEBUG = setDEBUG();

function setDEBUG(){
    let debug_active = false;
    let gtm_debug_url_parameter = getUrlParameter('gtm_debug');
    gtm_debug_url_parameter = !!+gtm_debug_url_parameter;
    if(gtm_debug_url_parameter !== null) {
        debug_active = gtm_debug_url_parameter;
    } else {
        if (typeof(Storage) !== "undefined") {
            let gtm_debug_local_storage = localStorage.getItem('gtm_debug');
            if (gtm_debug_local_storage)
                debug_active = gtm_debug_local_storage;
        }
    }
    if (typeof(Storage) !== "undefined") {
        if(debug_active)
            localStorage.setItem('gtm_debug', debug_active);
        else
            localStorage.removeItem('gtm_debug');
    }
    return debug_active;
}

function setDataLayer(googleConfig, acceptedGDPR = false) {
    ACCEPTED_GDPR = acceptedGDPR;
    if(IS_GTM_ACTIVE) {
        writeDebug('setDataLayer');
        let freeShipping = undefined;
        if (isCheckoutPage()) {
            if (Shopify.Checkout.step === 'thank_you') {
                googleConfig['page_type'] = 'purchase';
                googleConfig['ecomm_pagetype'] = 'purchase';
                freeShipping = getFreeShipping(gtm_shipping_price);
            } else {
                googleConfig['page_type'] += ' '+getNumStepCheckout();
                if (Shopify.Checkout.step === 'payment_method') {
                    freeShipping = getFreeShipping(gtm_shipping_price);
                }
            }
        }
        let ecomm_totalvalue;
        if (googleConfig['page_type'] === 'Product')
            ecomm_totalvalue = googleConfig['product_price'];
        else
            ecomm_totalvalue = googleConfig['cart_value'];

        let keyCartValue = 'cart_value_' + googleConfig['currency_code'];
        let user_browser_lang = window.navigator.userLanguage || window.navigator.language;
        let dataLayer = {
            cart_quantity: parseFloat(googleConfig['cart_quantity']),
            [keyCartValue]: parseFloat(googleConfig['cart_value']),
            client_id: getClientID(),
            currency_code: googleConfig['currency_code'],
            device: getDeviceFromWindow(),
            ecomm_pagetype: googleConfig['ecomm_pagetype'],
            ecomm_prodid: googleConfig['ecomm_prodid'],
            ecomm_totalvalue: parseFloat(ecomm_totalvalue),
            page_name: googleConfig['page_name'],
            page_type: googleConfig['page_type'],
            user_browser_lang: user_browser_lang.substring(0, 2),
            user_id: getUserID(),
            user_type: getUserType()
        };
        if (googleConfig['currency_code'] !== 'EUR') {
            dataLayer['cart_value_EUR'] = convertToEur(
                googleConfig['cart_value'],
                googleConfig['currency_code']
            );
        }

        if (
            googleConfig['page_type'] === 'index' ||
            googleConfig['page_type'] === 'product' ||
            googleConfig['page_type'] === 'collection'
        ) {
            dataLayer['coupon_code'] = getInitialCoupon();
            //dataLayer['promotion'] = getPromotion();
            //localStorage.setItem("promotionHome", dataLayer['promotion']);
        }

        if (googleConfig['payment_method'])
            dataLayer['payment_method'] = googleConfig['payment_method'];

        if (freeShipping !== undefined)
            dataLayer['shipping_free'] = freeShipping;

        if(typeof googleConfig['ecomm_category'] !== 'undefined')
            dataLayer['ecomm_category'] = googleConfig['ecomm_category'];

        writeDebug(dataLayer);
        DATALAYER = true;
        sendDataToAudit(dataLayer);
        return [dataLayer];
    }
    return [];
}

function getNumStepCheckout() {
    if(Shopify.Checkout.step === CHECKOUT_STEP_1){
        return 1;
    } else if(Shopify.Checkout.step === CHECKOUT_STEP_2) {
        return 2;
    }else if(Shopify.Checkout.step === CHECKOUT_STEP_3) {
        return 3;
    }
}

document.addEventListener("DOMContentLoaded", function(event) {
    if(IS_GTM_ACTIVE && GTM_PHASE_2) {
        if (DATALAYER) processGTM();
        else tryProcessGTM();
    }
});

function tryProcessGTM() {
    setTimeout(function() {
        if (DATALAYER) processGTM();
        else tryProcessGTM();
    }, 50);
}

function processGTM() {
    writeDebug('DataLayer');
    writeDebug(dataLayer);
    for (let i = 0; i < classBindActions.length; i++) {
        let clase = classBindActions[i];
        let elements = document.getElementsByClassName(clase);
        for (let j = 0; j < elements.length; j++) {
            elements[j].addEventListener('click', actionEvent);
        }
    }
    if (isCheckoutPage()) processCheckout();
    else processNotInCheckout();
    sendCountryUser();
}

function isCheckoutPage() {
    return location.href.indexOf('/checkouts/') !== -1;
}

function processCheckout() {
    writeDebug('Estamos en el checkout');
    //event formulario cupon_KO
    bindObserverCoupon();
    let actualStep = Shopify.Checkout.step;
    if (actualStep === 'contact_information') {
        checkout(2);
        //event transaccion pagar_paypal paypal
        addDataToPaypalButton();
        //event formulario continuar_KO_datos_usuario
        checkErrorsInCheckout('continuar_KO_datos_usuario');
        if(ACCEPTED_GDPR) {
            let buttonsContinue = document.getElementsByClassName('step__footer__continue-btn');
            for (let j = 0; j < buttonsContinue.length; j++) {
                buttonsContinue[j].addEventListener('click', saveCustomerInformation);
            }
        }
    } else if (actualStep === 'shipping_method') {
        checkout(3);
        //event formulario continuar_OK continuar_OK_datos_usuario
        customerStepOK();
    } else if (actualStep === 'payment_method') {
        checkout(4);
        //event formulario continuar_KO_datos_usuario
        checkErrorsInCheckout('continuar_KO_direccion_pago');
        //event formulario continuar_KO_tarjeta_pago
        checkErrorsInCheckout('continuar_KO_tarjeta_pago');
        //event transaccion pagar_<pasarela> <pasarela>
        bindBtnContinuePaymentMethod();
    } else if (actualStep === 'thank_you') {
        //event formulario continuar_OK continuar_OK_pago
        OKPago();
        thanksPage();
    }
    //event interaccion volver
    bindBackButtonInCheckout();
    bindBreadcrumbClick();
}

function processNotInCheckout() {
    window.onscroll = function(){
        didScroll = true;
    };
    setTimeout(scrollWasMade, 50);
    getProductsImpressions();

    detectFirstRowCategory();
    bindSocialButtons();
    let inputsUpdates = document.getElementsByName('updates[]');
    for (let j = 0; j < inputsUpdates.length; j++) {
        inputsUpdates[j].addEventListener('change', cartModified);
    }
    sendPromotion();
}

function scrollWasMade() {
    if (didScroll) {
        didScroll = false;
        detectFirstRowCategory();
        getProductsImpressions();
    }
    setTimeout(scrollWasMade, 50);
}

function sendPromotion() {
    let promotion = getPromotion();
    writeDebug('sendPromotion');
    sendObject({ promotion: promotion });
    localStorage.setItem('promotionHome', promotion);
}

function getPromotion() {
    let alt;
    let bannersIndex = document.getElementsByClassName('banner-index');
    for (let j = 0; j < bannersIndex.length; j++) {
        let imgs = bannersIndex[j].getElementsByTagName('img');
        for (let i = 0; i < imgs.length; i++) {
            alt = getData(imgs[i], 'type-promo');
        }
    }
    if (alt !== undefined && alt !== null) {
        return alt;
    } else {
        let promotionHome = localStorage.getItem('promotionHome');
        if (promotionHome !== null && promotionHome !== 'null')
            return promotionHome;
        else
            return 'undefined';
    }
}

function writeDebug(msg) {
    if (DEBUG) console.log(msg);
}

function sendEvent(event, action, label) {
    writeDebug('sendEvent');
    let objectToSend = getStandardObject(event, action, label);
    sendObject(objectToSend);
}

function sendDataToAudit(object) {
    if (typeof(Storage) !== "undefined") {
        let token = getUrlParameter('audit_gtm');
        if(token != null){
            sessionStorage.setItem('audit_gtm', token);
        }
        token = sessionStorage.getItem('audit_gtm');
        if (token !== null) {
            let phase = GTM_PHASE_2 ? 1 : 0;
            let url = "https://cdn.vulturdev.com/api/petition";
            url += "?data="+JSON.stringify(object);
            url += "&GTM_PHASE_2="+phase;
            url += "&token="+token;
            url += "&GTM_ID="+GTM_ID;
            url += "&domain="+document.domain;
            url += "&callback=?";
            getJSONP(url, responseAudit);
        }
    }
}

function getJSONP(url, success) {
    let ud = '_' + +new Date+'_'+Math.floor((Math.random() * 1000) + 1),
        script = document.createElement('script'),
        head = document.getElementsByTagName('head')[0]
            || document.documentElement;

    window[ud] = function(data) {
        head.removeChild(script);
        success && success(data);
    };

    script.src = url.replace('callback=?', 'callback=' + ud);
    head.appendChild(script);
}

function responseAudit(json) {
    if(json.status === 'OK') {
        writeDebug("JSON manager: ");
        writeDebug(json);
        let url_auditoria = 'https://cdn.vulturdev.com/audits/' + json.audit_id;
        if (document.getElementById("gtm-modal-audit") === null) {
            let body = document.getElementsByTagName('body')[0];
            if(body !== undefined) {
                body.insertAdjacentHTML('afterbegin',
                    '<div id="gtm-modal-audit" style="position: fixed; bottom: 5em; right: 1em;z-index: 999999; background-color: #007bff; padding: 1em; border-radius: 3px; box-shadow: 0 2px 2px 0 rgba(0,0,0,0.14), 0 3px 1px -2px rgba(0,0,0,0.12), 0 1px 5px 0 rgba(0,0,0,0.2);">' +
                    '<a href="' + url_auditoria + '" target="_blank" style="color: #fff;" >Ir a auditoría GTM</a>' +
                    '</div>'
                );
                setTimeout(function () {
                    document.getElementById("gtm-modal-audit").style.top = 'auto';
                }, 3000);
            }
        }
    } else {
        if (document.getElementById("gtm-modal-audit") === null) {
            let body = document.getElementsByTagName('body')[0];
            body.insertAdjacentHTML('afterbegin',
                '<div id="gtm-modal-audit" style="position: fixed; bottom: 5em; right: 1em;z-index: 999999; background-color: #007bff; padding: 1em; border-radius: 3px; box-shadow: 0 2px 2px 0 rgba(0,0,0,0.14), 0 3px 1px -2px rgba(0,0,0,0.12), 0 1px 5px 0 rgba(0,0,0,0.2);">' +
                '<span>Token not recognized</span>' +
                '</div>'
            );
            setTimeout(function () {
                document.getElementById("gtm-modal-audit").style.top = 'auto';
            }, 3000);
        }
    }
}

function getUrlParameter(name) {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search)||[,""])[1].replace(/\+/g, '%20'))||null
}

function getStandardObject(event, action, label) {
    return {
        event: event,
        eAction: action,
        eLabel: label,
    };
}

function sendObject(object) {
    writeDebug('GTM');
    writeDebug(object);
    sendDataToAudit(object);
    dataLayer.push(object);
}

function addDataToPaypalButton() {
    let paypalExpressCheckoutBtn = document.getElementById('paypal-express-checkout-btn');
    if(paypalExpressCheckoutBtn !== null) {
        setData(paypalExpressCheckoutBtn, 'gtm-event', 'formulario');
        setData(paypalExpressCheckoutBtn, 'gtm-action', 'datos_con_paypal');
        setData(paypalExpressCheckoutBtn, 'gtm-label', 'datos_con_paypal');
        paypalExpressCheckoutBtn.addEventListener('click', actionEvent);
    }
}

function bindBreadcrumbClick() {
    let actualPositionBreadcrumb = getActualPositionBreadCrumb();
    let breadcrumb = document.getElementsByClassName('breadcrumb');
    for (let j = 0; j < breadcrumb.length; j++) {
        let enlaces = breadcrumb[j].getElementsByTagName('a');
        for (let i = 0; i < enlaces.length; i++) {
            let enlace = enlaces[i];
            let href = enlace.href;
            let positionBreadcrumbClicked = getPositionBreadcrumbClicked(href);
            if (positionBreadcrumbClicked < actualPositionBreadcrumb) {
                if (href.indexOf('/cart') >= 0)
                    bindDataToElement('interaccion', 'volver_carrito', 'volver', this);
                else if (href.indexOf('contact_information') >= 0)
                    bindDataToElement('interaccion', 'volver_info_cliente', 'volver', this);
                else if (href.indexOf('shipping_method') >= 0)
                    bindDataToElement('interaccion', 'volver_forma_envio', 'volver', this);
            }
        }
    }
}

function bindObserverCoupon() {
    let buttonApply = getButtonApplyCoupon(getCouponInput());
    if(buttonApply !== null) {
        buttonApply.addEventListener('click', function () {
            let interval = setInterval(function () {
                let couponInput = getCouponInput();
                if(couponInput !== null) {
                    buttonApply = getButtonApplyCoupon(couponInput);
                    if (!buttonApply.classList.contains('btn--loading')) {
                        writeDebug('Ya hemos recibido respuesta');
                        let errorForCoupon = document.getElementById('error-for-reduction_code');
                        if (errorForCoupon.length > 0 && errorForCoupon.style.display === 'visible') {
                            writeDebug('Hay error y es visible');
                            let couponString = couponInput.value;
                            cuponInvalid(couponString);
                        }
                        clearInterval(interval);
                        bindObserverCoupon();
                    }
                }
            }, 500);
        });
    }
}

function getCouponInput() {
    return document.getElementById('checkout_reduction_code');
}

function getButtonApplyCoupon(couponInput) {
    if(couponInput !== null) {
        return couponInput
            .parentElement
            .parentElement
            .getElementsByTagName('button')[0];
    }
    return null;
}

function getActualPositionBreadCrumb() {
    let breadcrumb = document.getElementsByClassName('breadcrumb');
    for (let j = 0; j < breadcrumb.length; j++) {
        let lis = breadcrumb[j].getElementsByTagName('li');
        for (let i = 0; i < lis.length; i++) {
            if (lis[i].classList.contains('item--current')) return i;
        }
    }
}

function getPositionBreadcrumbClicked(href) {
    let breadcrumb = document.getElementsByClassName('breadcrumb');
    for (let j = 0; j < breadcrumb.length; j++) {
        let lis = breadcrumb[j].getElementsByTagName('li');
        for (let i = 0; i < lis.length; i++) {
            let element = lis[i];
            let as = element.getElementsByTagName('a');
            if(as.length > 0) {
                let hrefA = as[0].href;
                if (hrefA === href)
                    return i;
            }
        }
    }
}

function bindBackButtonInCheckout() {
    let backButtons = document.getElementsByClassName('step__footer__previous-link');
    for (let j = 0; j < backButtons.length; j++) {
        let hrefBackButton = backButtons[j].href;
        if (hrefBackButton.indexOf('/cart') >= 0) {
            bindDataToElement('interaccion', 'volver_carrito', 'volver', backButtons[j]);
        } else if (hrefBackButton.indexOf('contact_information') >= 0) {
            bindDataToElement('interaccion', 'volver_info_cliente', 'volver', backButtons[j]);
        } else if (hrefBackButton.indexOf('shipping_method') >= 0) {
            bindDataToElement('interaccion', 'volver_forma_envio', 'volver', backButtons[j]);
        }
    }
}

function checkErrorsInCheckout(section) {
    if (section === 'continuar_KO_tarjeta_pago')
        checkErrorsInCheckoutPayment(idErrorsPayment, section);
    else checkErrorsInCheckoutPayment(idErrorsCheckout, section);
}

function checkErrorsInCheckoutPayment(ids, section) {
    ids.forEach(function(element) {
        let inputError = document.getElementById('#' + element);
        if(inputError !== null) {
            if (inputError.length > 0 && inputError.style.display === 'visible') {
                errorDataInForm(getGoogleConstantForInputID(element), section); //<|nombre_KO|pais_KO>
            }
        }
    });
}

function getGoogleConstantForInputID(inputID) {
    switch (inputID) {
        case 'error-for-email':
            return 'email_KO';
        case 'error-for-last_name':
            return 'apellidos_KO';
        case 'error-for-address1':
            return 'direccion_KO';
        case 'error-for-city':
            return 'ciudad_KO';
        case 'error-for-province':
            return 'provincia_KO';
        case 'error-for-zip':
            return 'codigo_postal_KO';
        case 'error-for-phone':
            return 'telefono_KO';
        case 'error-for-number':
            return 'numtarjeta_KO';
        case 'error-for-name':
            return 'nomtarjeta_KO';
        case 'error-for-expiry':
            return 'mm_aa_KO';
        case 'error-for-verification_value':
            return 'cvv_KO';
    }
}

/**
 * Action events
 */

function actionEvent() {
    if (hasClass(this, 'gtm-product'))
        sendProductClick(this);
    else if (hasClass(this,'gtm-modify-cart-product'))
        cartModified();
    else if (hasClass(this, 'gtm-add-to-cart-product')) {
        if (this.dataset.productid) {
            addToCartProduct(getElementWithDataValue('id', this.dataset.productid));
        } else {
            let form = this;
            do{
                form = form.parentElement;
            }while(!form.tagName === 'FORM' && !form.tagName === 'HTML');

            if(form.tagName === 'FORM') {
                let inputs = form.document.getElementsByName('id[]');
                let elements = [];
                for (let j = 0; j < inputs.length; j++) {
                    let element = inputs[j];
                    let id = element.value;
                    elements.push(getElementWithDataValue('productid', id));
                }
                addToCartProduct(elements);
            }
        }
    } else if (hasClass(this, 'gtm-remove-from-cart'))
        removeFromCart(this);
    else otherClicks(this);
}

function getElementWithDataValue(data_name, value) {
    let datas = document.querySelectorAll('[data-'+data_name+']');
    for (let j = 0; j < datas.length; j++) {
        if(getData(datas[j], data_name) === value) {
            return datas[j];
        }
    }
}

function hasClass(element, clase) {
    return element.classList.contains(clase);
}

function sendProductClick(productElem) {
    let objectToPush = {
        event: 'productClick',
        ecommerce: {
            click: {
                actionField: { list: googleConfig['list'] },
                products: [readProduct(productElem)],
            },
        },
    };
    writeDebug('sendProductClick');
    sendObject(objectToPush);
}

function cartModified() {
    let inputs = document.getElementsByName('updates[]');
    for (let j = 0; j < inputs.length; j++) {
        let input = inputs[j];
        let id = input.getAttribute('id');
        let elemProd = getElemProductWithIdLine(id);
        let quantity = parseInt(input.value);
        let quantityPrev = elemProd.dataset.quantity;
        writeDebug('quantity(' + quantity + ') quantityPrev(' + quantityPrev + ')');
        if (hasRemoveQuantity(quantityPrev, quantity)) {
            let diff = quantityPrev - quantity;
            removeFromCartQuantity(elemProd, diff);
        } else if (hasAddedQuantity(quantityPrev, quantity)) {
            let diff = quantity - quantityPrev;
            elemProd.dataset.quantity = diff;
            addToCartProduct(elemLine);
        }
        elemProd.dataset.quantity = quantity;
    }
}

function getElemProductWithIdLine(id) {
    //id = updates_30190885714
    return getElementWithDataValue('productid', id.split('_')[1]);
}

function hasRemoveQuantity(quantityPrev, quantity) {
    return quantityPrev > quantity;
}

function hasAddedQuantity(quantityPrev, quantity) {
    return quantityPrev < quantity;
}

function addToCartProduct(product) {
    let products = false;
    if (!product) products = readProducts(document.getElementsByClassName('gtm-product-info'));
    else products = readProducts(product);
    if (products) {
        for (let j = 0; j < products.length; j++) {
            delete products[j].list;
        }
        let objectToPush = {
            event: 'addToCart',
            ecommerce: {
                currencyCode: googleConfig['currency_code'],
                add: {
                    products: products,
                },
            },
        };
        writeDebug('addToCartProduct');
        sendObject(objectToPush);
    }
}

function removeFromCart(elem) {
    removeFromButtonDelete(elem);
}

function removeFromButtonDelete(elemButton) {
    if (elemButton.dataset.productid) {
        let productDelete = getElementWithDataValue('id', elemButton.dataset.productid);
        removeFromCartQuantity(productDelete, productDelete.dataset.quantity);
    }
}

function removeFromCartQuantity(elem, quantity) {
    if (elem.dataset.productid) {
        let product = readProduct(elem);
        product['quantity'] = quantity;
        let objectToPush = {
            event: 'removeFromCart',
            ecommerce: {
                remove: {
                    products: [product],
                },
            },
        };
        writeDebug('removeFromCart');
        sendObject(objectToPush);
    }
}

function otherClicks(elem) {
    let event = getData(elem, 'gtm-event');
    let action = getData(elem, 'gtm-action');
    let label = getData(elem, 'gtm-label');
    if (event !== undefined) {
        let objectToPush = getStandardObject(event, action, label);
        if (event === 'transaccion' && elem.dataset.paymentMethod)
            objectToPush['paymentMethod'] = elem.dataset.paymentMethod;
        writeDebug('actionEvent');
        sendObject(objectToPush);
    }
}

function getFreeShipping(gtm_shipping_price) {
    if (gtm_shipping_price === '0') return 'SI';
    return 'NO';
}

function getInitialCoupon() {
    let url = new URL(document.location.href);
    let discount = url.searchParams.get('code');
    if (discount !== null) return discount;
    else return 'none';
}

function getUserID() {
    return "undefined";
}

function getClientID() {
    let gaCookie = read_cookie('_ga');
    if (gaCookie != null) {
        //GA1.2.652914739.1499699784
        let lastPoint = gaCookie.lastIndexOf('.');
        let firstPart = gaCookie.substr(0, lastPoint);
        let lastPointInFirstPart = firstPart.lastIndexOf('.');
        let lastPartInFirstPart = firstPart.substr(
            lastPointInFirstPart + 1,
            firstPart.length
        );
        let lastPart = gaCookie.substr(lastPoint, firstPart.length);
        return lastPartInFirstPart + lastPart;
    }
    return "undefined";
}

function read_cookie(key) {
    let result;
    return (result = new RegExp(
        '(?:^|; )' + encodeURIComponent(key) + '=([^;]*)'
    ).exec(document.cookie))
        ? result[1]
        : null;
}

function getUserType() {
    let visited = read_cookie('shopify_visited');
    if (visited == null) {
        document.cookie = 'shopify_visited=1';
        return 'New User';
    } else {
        return 'Returning User';
    }
}

function getDeviceFromWindow() {
    if (screen.width < 640) return 'mobile';
    else if (screen.width >= 640 && screen <= 1024) return 'tablet';
    else return 'desktop';
}

function isScrolledIntoView(elem) {
    if (!elem.style.display === 'visible') {
        return false;
    }
    return checkvisible(elem);
}

function checkvisible( elm ) {
    let scrollTop = scrollY(),
        posYElem = posY(elm);
    return posYElem > scrollTop && posYElem < viewPortHeight() + scrollTop;
}

function viewPortHeight() {
    var de = document.documentElement;

    if(!!window.innerWidth)
    { return window.innerHeight; }
    else if( de && !isNaN(de.clientHeight) )
    { return de.clientHeight; }

    return 0;
}

function scrollY() {
    if( window.pageYOffset ) { return window.pageYOffset; }
    return Math.max(document.documentElement.scrollTop, document.body.scrollTop);
}

function posY(elm) {
    var test = elm, top = 0;

    while(!!test && test.tagName.toLowerCase() !== "body") {
        top += test.offsetTop;
        test = test.offsetParent;
    }

    return top;
}

function detectFirstRowCategory() {
    if (gtm_template !== 'product') {
        let first_in_collections = document.getElementsByClassName('gtm-first-in-collection');
        for (let j = 0; j < first_in_collections.length; j++) {
            let e = first_in_collections[j];
            let categorypos = e.dataset.categorypos;
            if (isScrolledIntoView(e)) {
                if (!scrolledCategories[categorypos]) {
                    scrolledCategories[categorypos] = true;
                    sendEvent('scroll', e.dataset.category, categorypos);
                }
            } else {
                if (!SEND_SCROLLED_ONLY_FIRST_TIME)
                    scrolledCategories[categorypos] = false;
            }
        }
    }
}

function readProduct(e) {
    if(e.length === 1)
        e = e[0];

    let keyPrice = 'price_' + googleConfig['currency_code'];
    let keyOriginalPrice = 'originalPrice_' + googleConfig['currency_code'];
    let keyProductDiscount = 'productDiscount_' + googleConfig['currency_code'];

    let product = {
        name: e.dataset.name,
        id: e.dataset.id,
        price: e.dataset.price,
        brand: e.dataset.brand,
        category: e.dataset.category,
        model: e.dataset.model,
        dimension15: e.dataset.model,
        paste: e.dataset.paste,
        dimension14: e.dataset.paste,
        color: e.dataset.color,
        dimension16: e.dataset.color,
        tag: e.dataset.tag,
        dimension17: e.dataset.tag,
        [keyPrice]: e.dataset.price, // Valor de la variable price, traducido a euros.
        metric2: e.dataset.price,
        [keyOriginalPrice]: e.dataset.originalprice, // Precio original en EUR (precio sin el descuento aplicado).
        metric3: e.dataset.originalprice,
        [keyProductDiscount]: e.dataset.productdiscount, // Precio descontado en EUR
        metric4: e.dataset.productdiscount,
    };
    if (googleConfig['currency_code'] !== 'EUR') {
        product['price_EUR'] = convertToEur(
            e.dataset.price,
            googleConfig['currency_code']
        );
        product['originalPrice_EUR'] = convertToEur(
            e.dataset.originalprice,
            googleConfig['currency_code']
        );
        product['productDiscount_EUR'] = convertToEur(
            e.dataset.productdiscount,
            googleConfig['currency_code']
        );

        product['metric2'] = convertToEur(
            product['metric2'],
            googleConfig['currency_code']
        );
        product['metric3'] = convertToEur(
            product['metric3'],
            googleConfig['currency_code']
        );
        product['metric4'] = convertToEur(
            product['metric4'],
            googleConfig['currency_code']
        );
    }
    if (googleConfig['list']) product['list'] = googleConfig['list'];
    if (e.dataset.position) product['position'] = e.dataset.position;
    let freeProduct = e.dataset.freeproduct;
    if (freeProduct !== undefined) {
        product['freeProduct'] = freeProduct;
    } else {
        if (product['price'] === 0) {
            product['freeProduct'] = 'SI';
        } else {
            product['freeProduct'] = 'NO';
        }
    }
    return product;
}

function sendLastProductScrolled(products) {
    if (products.length > 0) {
        let objectToPush = {
            event: 'impressionsLoad',
            ecommerce: {
                currencyCode: googleConfig['currency_code'],
                impressions: products,
            },
        };
        writeDebug('sendLastProductScrolled');
        sendObject(objectToPush);
    }
}

function getProductsImpressions() {
    let products = document.getElementsByClassName('gtm-product');
    for(let j = 0; j < products.length; j++) {
        let e = products[j];
        let position = e.dataset.id;
        if (position === undefined)
            writeDebug('Los productos necesitan tener el sku en data-id');
        if (isScrolledIntoView(e)) {
            if (!scrolledProducts[position]) {
                scrolledProducts[position] = true;
                lastProductScrolled.push(readProduct(e));
            }
        } else {
            if (!SEND_SCROLLED_ONLY_FIRST_TIME) scrolledProducts[position] = false;
        }
    }
    if (lastProductScrolled.length > 0) {
        sendLastProductScrolled(lastProductScrolled);
        lastProductScrolled = [];
    }
}

function sendProductRender() {
    if(IS_GTM_ACTIVE && GTM_PHASE_2) {
        let productElem = document.getElementsByClassName('gtm-product-load');
        if (productElem.length) {
            let objectToPush = {
                event: 'productDetailLoad',
                ecommerce: {
                    detail: {
                        products: [readProduct(productElem)],
                    },
                },
            };
            delete objectToPush.ecommerce.detail.products[0].list;
            writeDebug('sendProductRender');
            sendObject(objectToPush);
        }
    }
}

function checkout(step) {
    if(GTM_PHASE_2) {
        if (step === STEP_CARRITO) {
            let inputs = document.getElementsByName('updates[]');
            for(let j = 0; j < inputs.length; j++) {
                let elem = inputs[j];
                products[elem.getAttribute('id')] = elem.value;
            }
        }
        let objectToPush = {
            event: 'checkout',
            ecommerce: {
                checkout: {
                    actionField: {step: step},
                    products: readProducts(document.getElementsByClassName('gtm-product-info')),
                },
            },
        };
        writeDebug('checkout');
        sendObject(objectToPush);
    }
}

function readProducts(elems) {
    let products = [];
    for(let j = 0; j < elems.length; j++) {
        let e = elems[j];
        let product = readProduct(e);
        product['quantity'] = e.dataset.quantity;
        products.push(product);
    }
    return products;
}

function cuponInvalid(cuponString) {
    sendEvent('formulario', 'cupon_KO', cuponString);
}

function errorDataInForm(field, section) {
    //field = email_KO|nombre_KO|apellidos_KO|direccion_KO|ciudad_KO|pais_KO|provincia_KO|codigo_postal_KO|telefono_KO
    sendEvent('formulario', field, section);
}

function saveCustomerInformation() {
    let customerInfoItem = localStorage.getItem('customerInfo');
    let lastCustomerInfo = undefined;

    if (customerInfoItem != null) lastCustomerInfo = JSON.parse(customerInfoItem);

    let newCustomerInfo = {
        email: document.getElementsByName("checkout[email]")[0].value,
        firstName: getValFromInputIfVisible(
            document.getElementsByName("checkout[shipping_address][first_name]")[0]
        ),
        lastname: getValFromInputIfVisible(
            document.getElementsByName("checkout[shipping_address][last_name]")[0]
        ),
        address: getValFromInputIfVisible(
            document.getElementsByName("checkout[shipping_address][address1]")[0]
        ),
        city: getValFromInputIfVisible(
            document.getElementsByName("checkout[shipping_address][city]")[0]
        ),
        country: document.getElementsByName("checkout[shipping_address][country]")[0].value,
        province: document.getElementsByName("checkout[shipping_address][province]").value,
        postalCode: getValFromInputIfVisible(
            document.getElementsByName("checkout[shipping_address][zip]")[0]
        ),
    };
    if (
        lastCustomerInfo === undefined ||
        lastCustomerInfo.email !== newCustomerInfo.email ||
        lastCustomerInfo.firstName !== newCustomerInfo.firstName ||
        lastCustomerInfo.lastname !== newCustomerInfo.lastname ||
        lastCustomerInfo.address !== newCustomerInfo.address ||
        lastCustomerInfo.city !== newCustomerInfo.city ||
        lastCustomerInfo.country !== newCustomerInfo.country ||
        lastCustomerInfo.province !== newCustomerInfo.province ||
        lastCustomerInfo.postalCode !== newCustomerInfo.postalCode
    ) {
        newCustomerInfo.correct = false;
    } else {
        newCustomerInfo.correct = lastCustomerInfo.correct;
    }
    localStorage.setItem('customerInfo', JSON.stringify(newCustomerInfo));
}

function getValFromInputIfVisible(input) {
    if(!input.classList.contains('visually-hidden'))
        return input.value;
    return undefined;
}

function customerStepOK() {
    let customerInfo = JSON.parse(localStorage.getItem('customerInfo'));
    if(customerInfo === null) {
        sendEvent('formulario', 'continuar_OK', 'continuar_OK_datos_usuario');
    }else {
        if (!customerInfo.correct) {
            sendEvent('formulario', 'continuar_OK', 'continuar_OK_datos_usuario');
            customerInfo.correct = true;
            localStorage.setItem('customerInfo', JSON.stringify(customerInfo));
        }
    }
}

function bindDataToElement(event, action, label, element) {
    setData(element, 'gtm-event', event);
    setData(element, 'gtm-action', action);
    setData(element, 'gtm-label', label);
    element.addEventListener('click', actionEvent);
}

function OKPago() {
    sendEvent('formulario', 'continuar_OK', 'continuar_OK_pago');
}

function thanksPage() {
    let idOrder_element = document.getElementsByClassName('os-order-number')[0];
    let idOrder = idOrder_element.innerHTML.split('#')[1].trim();
    let revenue = Shopify.checkout.total_price;
    let shipping = 0;
    if (
        Shopify.checkout.shipping_rate !== undefined &&
        Shopify.checkout.shipping_rate.price !== undefined
    ) {
        shipping = Shopify.checkout.shipping_rate.price;
    }
    let objectToPush = {
        ecommerce: {
            purchase: {
                actionField: {
                    id: idOrder, // Transaction ID. Required for purchases and refunds.
                    revenue: revenue, // Total transaction value
                    shipping: shipping,
                    coupon: googleConfig['coupon'], // If no coupon is used, this field may be omitted or set to empty string.
                },
                products: readProducts(document.getElementsByClassName('gtm-product-info')),
            },
        },
    };
    if(!ACCEPTED_GDPR) {
        delete(objectToPush.ecommerce.purchase.actionField.id);
    }
    writeDebug('thanksPage');
    sendObject(objectToPush);
}

function bindBtnContinuePaymentMethod() {
    let btnContinue = document.getElementsByClassName('step__footer__continue-btn');
    for(let j = 0; j < btnContinue.length; j++) {
        btnContinue[j].addEventListener('click', function() {
            let inputs = document.getElementsByName('checkout[payment_gateway]');
            let paymentMethod = null;
            for(let i = 0; i < inputs.length; i++) {
                let input = inputs[i];
                if(input.checked){
                    paymentMethod = input;
                }
            }
            if(paymentMethod === null) {
                inputs = document.getElementsByName("checkout[payment_gateway]");
                for(let i = 0; i < inputs.length; i++) {
                    let input = inputs[i];
                    if(input.enabled) {
                        paymentMethod = input;
                    }
                }
            }
            if(paymentMethod !== null)
                sendPaymentMethod(paymentMethod);
        });
    }
}

function sendPaymentMethod(paymentMethod) {
    let paymentMethodValue = paymentMethod.value;
    if (paymentMethods[paymentMethodValue] !== undefined) {
        let paymentMethodValueToGoogle = paymentMethods[paymentMethodValue];
        sendEvent(
            'transaccion',
            'pagar_' + paymentMethodValueToGoogle,
            paymentMethodValueToGoogle
        );
    } else {
        writeDebug('No se sabe el metodo de pago seleccionado');
    }
}

function sendCountryUser() {
    getJSONP('http://freegeoip.net/json/?callback=?', responseCountryUser);
}

function responseCountryUser(data) {
    let country = data.country_name;
    writeDebug('sendCountryUser');
    sendObject({ event: 'country', country: country.toLowerCase() });
}

function bindSocialButtons() {
    let as = document.getElementsByTagName('a');
    for(let j = 0; j < as.length; j++) {
        let a = as[j];

        let href = a.href;
        if (href !== undefined) {
            let gtm_action = '';
            if (href.indexOf('facebook.com') >= 0) {
                gtm_action = 'facebook';
            } else if (href.indexOf('twitter.com') >= 0) {
                gtm_action = 'twitter';
            } else if (href.indexOf('instagram.com') >= 0) {
                gtm_action = 'instagram';
            }
            if (gtm_action !== '') {
                if (!hasClass(a, 'gtm-action')) {
                    a.classList.add('gtm-action');
                }
                addDataIfNotExists(a, 'gtm-event', 'redes_sociales');
                addDataIfNotExists(a, 'gtm-action', gtm_action);
                addDataIfNotExists(a, 'gtm-label', 'seguir');
            }
        }
    }
}

function addDataIfNotExists(elem, nameData, value) {
    if (getData(elem, nameData) === undefined)
        setData(elem, nameData, value);
}

function convertToEur(value, currencyCode) {
    if (typeof gtm_currencies !== 'undefined')
        return Math.round(parseFloat(value) / gtm_currencies[currencyCode] * 100) / 100;
    else return 'undefined';
}

function getData(elem, dataName) {
    return elem.getAttribute('data-'+dataName);
}

function setData(elem, dataName, value) {
    elem.setAttribute('data-'+dataName, value);
}