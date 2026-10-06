'use strict';

// Generuje parę kluczy VAPID do wklejenia w zmienne Railway (opcjonalne —
// bez nich serwer sam wygeneruje klucze i zapisze je w MongoDB).
const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('VAPID_SUBJECT=mailto:kontakt@revserwis.pl');
