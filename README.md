# PeerTube plugin premium users

## About
This plugin will add a video field where uploaders can choose whether the video is a premium video or not. Premium videos will only be shown for paid users, other users will see a preselected default video.
To become a premium user a user has to go to My account > Premium and click "Subscribe to become a premium user". He will then be redirected to Stripe and when the checkout is complete he's a premium user.

## Prerequisites
* Stripe API key.
* Stripe webhook listening for `checkout.session.completed`, `invoice.paid` and `invoice.payment_failed`.
* Stripe product whom premium users will subscribe to.
* Replacement video to be shown for non-premium users.

## TODO:
* ~Support for cancel subscriptions.~
* ~Remove payments from DB and get from API instead.~
* ~Create checkout from API instead of static URL.~
* ~Support change payment method.~
* ~Listen to webhook to know when subscription has ended.~
* Verify paymentStatus is accurate upon GET /subscriptions
* ~Change storage to Postgres~
* ~Add Google Analytics support.~

## Demo / testing
* `cd tests`
* `./setup-test-env.sh`
* `open http://localhost:9000`