"use strict";

const $ = require("jquery");
const storage = require("./localStorage");
const socket = require("./socket");

const pushNotificationsButton = $("#pushNotifications");
let clientSubscribed = null;
let applicationServerKey;

module.exports.configurePushNotifications = (subscribedOnServer, key) => {
	applicationServerKey = key;

	// If client has push registration but the server knows nothing about it,
	// this subscription is broken and client has to register again
	if (clientSubscribed === true && subscribedOnServer === false) {
		pushNotificationsButton.attr("disabled", true);

		navigator.serviceWorker.register("service-worker.js").then((registration) => registration.pushManager.getSubscription().then((existingSubscription) => {
			if (!existingSubscription) {
				return;
			}

			return existingSubscription.unsubscribe().then((successful) => {
				if (successful) {
					alternatePushButton().removeAttr("disabled");
				}
			});
		}));
	}
};

if (isAllowedServiceWorkersHost()) {
	$("#pushNotificationsHttps").hide();

	if ("serviceWorker" in navigator) {
		navigator.serviceWorker.register("service-worker.js").then((registration) => {
			if (!registration.pushManager) {
				return;
			}

			return registration.pushManager.getSubscription().then((subscription) => {
				$("#pushNotificationsUnsupported").hide();

				pushNotificationsButton
					.removeAttr("disabled")
					.on("click", onPushButton);

				clientSubscribed = !!subscription;

				if (clientSubscribed) {
					alternatePushButton();
				}
			});
		}).catch((err) => {
			$("#pushNotificationsUnsupported p").text(err);
		});
	}
}

function onPushButton() {
	pushNotificationsButton.attr("disabled", true);

	navigator.serviceWorker.register("service-worker.js").then((registration) => registration.pushManager.getSubscription().then((existingSubscription) => {
		if (existingSubscription) {
			socket.emit("push:unregister", storage.get("token"));

			return existingSubscription.unsubscribe().then((successful) => {
				if (successful) {
					alternatePushButton().removeAttr("disabled");
				}
			});
		}

		return registration.pushManager.subscribe({
			applicationServerKey: urlBase64ToUint8Array(applicationServerKey),
			userVisibleOnly: true
		}).then((subscription) => {
			const rawKey = subscription.getKey ? subscription.getKey("p256dh") : "";
			const key = rawKey ? window.btoa(String.fromCharCode.apply(null, new Uint8Array(rawKey))) : "";
			const rawAuthSecret = subscription.getKey ? subscription.getKey("auth") : "";
			const authSecret = rawAuthSecret ? window.btoa(String.fromCharCode.apply(null, new Uint8Array(rawAuthSecret))) : "";

			socket.emit("push:register", {
				token: storage.get("token"),
				endpoint: subscription.endpoint,
				keys: {
					p256dh: key,
					auth: authSecret
				}
			});

			alternatePushButton().removeAttr("disabled");
		});
	})).catch((err) => {
		console.error(err);
		window.alert(err);
	});

	return false;
}

function alternatePushButton() {
	const text = pushNotificationsButton.text();

	return pushNotificationsButton
		.text(pushNotificationsButton.data("text-alternate"))
		.data("text-alternate", text);
}

function urlBase64ToUint8Array(base64String) {
	const padding = "=".repeat((4 - base64String.length % 4) % 4);
	const base64 = (base64String + padding)
		.replace(/-/g, "+")
		.replace(/_/g, "/");

	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);

	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}

	return outputArray;
}

function isAllowedServiceWorkersHost() {
	return location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}
