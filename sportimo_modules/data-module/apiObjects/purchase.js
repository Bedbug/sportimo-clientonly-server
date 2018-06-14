// Module dependencies.
var mongoose = require('mongoose'),
  Purchase = mongoose.models.purchase,
  api = {},
  l = require('../config/lib');
var cbf = l.responseCallback; //Aliasing auto responseCallback

/**
 * Google API References for Subscription Verifications
 */
var google = require('googleapis');
var androidpublisher = google.androidpublisher('v2');
var key = require('../config/googleapiskey.json');
var jwtClient = new google.auth.JWT(
  key.client_email,
  null,
  key.private_key,
  ['https://www.googleapis.com/auth/androidpublisher'], // an array of auth scopes
  null
);

var needle = require("needle");
var moment = require("moment");

/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAllPurchases = function (skip, limit, cb) {
  var q = Purchase.find();

  if (skip != undefined)
    q.skip(skip * 1);

  if (limit != undefined)
    q.limit(limit * 1);

  return q.exec((err, purchases) => {
    cbf(cb, err, { purchases: purchases, count: purchases.length })
  });
};

// GET
api.getPurchase = function (id, cb) {

  Purchase.findOne({ '_id': id }, (err, purchase) => {
    if (purchase == null) return cbf(cb, 'No Data Found', 404);
    return cbf(cb, err, purchase);
  });
};

// POST
api.addPurchase = function (purchase, cb) {

  if (purchase == 'undefined') {
    cb('No Purchase Provided. Please provide valid purchase data.');
  }

  purchase = new Purchase(purchase);

  purchase.save((err, saved) => {
    cbf(cb, err, saved.toObject());
  });
};

api.verifySubscription = function (data, cb) {

  // ios shared secret: 46c8967b6efa4ddc85690a70dd2f4a20
  // var iTunesSharedSecret = "46c8967b6efa4ddc85690a70dd2f4a20";
  var iTunesSharedSecret = "61d38d1170444fe4992c28bd799dec13";

  if (data.store === "GooglePlay") {
    jwtClient.authorize(function (err, tokens) {      
      if (err) {
        console.log(err);
        return cbf(cb, err, resp);
      }

      // Make an authorized request to list Drive files.
      androidpublisher.purchases.subscriptions.get({
        auth: jwtClient,
        packageName: data.packageName,
        subscriptionId: "com.sportimo.subscription.monthly",
        token: data.purchaseToken
      }, function (err, resp) {

        var momentDate;
        if (resp && resp.expiryTimeMillis)
          momentDate = moment(parseInt(resp.expiryTimeMillis)).utc();        
        if (momentDate) {
          if (momentDate.diff(moment()) < 0) {
            console.log('Subscription Expired, expiration date: ' + momentDate.format());
            return cbf(cb, err, { "subscriptionStatus": 2, "validUntil": momentDate.format() });
          } else {
            console.log('Subscription Active, expiration date: ' + momentDate.format());
            return cbf(cb, err, { "subscriptionStatus": 1, "validUntil": momentDate.format() });
          }
        } else {
          console.log('Something is wrong with the subscription.');
           return cbf(cb, err, { "subscriptionStatus": 2, "validUntil": moment().format() });
        }


      });
    });
  }

  if (data.store === "Apple") {
    var appleValidationObject = {
      "receipt-data": data.receipt,
      "password": iTunesSharedSecret,
      "exclude-old-transactions": true
    }

    var appleUrl;

    if (process.env.NODE_ENV == "development")
      appleUrl = "https://sandbox.itunes.apple.com/verifyReceipt";
    else
      appleUrl = "https://buy.itunes.apple.com/verifyReceipt";


    return needle.post(appleUrl, appleValidationObject, { json: true }, function (err, resp) {
      // console.log(resp)
      var appleRes = JSON.parse(resp.body.toString());
      if (!appleRes.latest_receipt_info) {
        return cbf(cb, err, { "subscriptionStatus": 2, "validUntil": moment().format() });
      }

      var momentDate = moment(parseInt(appleRes.latest_receipt_info[0].expires_date_ms)).utc();

      if (momentDate.diff(moment()) < 0) {
        console.log('Subscription Expired, expiration date: ' + momentDate.format());
        return cbf(cb, err, { "subscriptionStatus": 2, "validUntil": momentDate.format() });
      } else {
        console.log('Subscription Active, expiration date: ' + momentDate.format());
        return cbf(cb, err, { "subscriptionStatus": 1, "validUntil": momentDate.format() });
      }

    });


    //console.log(iTunesSharedSecret);

    //https://sandbox.itunes.apple.com/verifyReceipt
    // receipt-data
    // The base64 encoded receipt data.
    // password
    // Only used for receipts that contain auto-renewable subscriptions. Your app’s shared secret (a hexadecimal string).
    // exclude-old-transactions
    //Only used for iOS7 style app receipts that contain auto-renewable or non-renewing subscriptions. If value is true, response includes only the latest renewal transaction for any subscriptions.
  }

  if (data.store == "Fake Store") {
    return cbf(cb, null, { "subscriptionStatus": 1, "validUntil": moment().format() });
  }

}
// PUT
api.editPurchase = function (id, updateData, cb) {

  if (updateData === undefined) {
    return cbf(cb, 'Invalid Data. Please Check purchase and/or updateData fields', null);
  }

  Purchase.findById(id, (err, purchase) => {

    //Force Error
    // if(item==null) return cbf(cb,'No Data Found',404); 

    if (typeof updateData["status"] != 'undefined') {
      purchase["status"] = updateData["status"];
    }

    if (typeof updateData["user"] != 'undefined') {
      purchase["user"] = updateData["user"];
    }

    if (typeof updateData["type"] != 'undefined') {
      purchase["type"] = updateData["type"];
    }

    if (typeof updateData["info"] != 'undefined') {
      purchase["info"] = updateData["info"];
    }

    if (typeof updateData["provider"] != 'undefined') {
      purchase["provider"] = updateData["provider"];
    }

    if (typeof updateData["method"] != 'undefined') {
      purchase["method"] = updateData["method"];
    }

    if (typeof updateData["receiptid"] != 'undefined') {
      purchase["receiptid"] = updateData["receiptid"];
    }

    if (typeof updateData["providerMessage"] != 'undefined') {
      purchase["providerMessage"] = updateData["providerMessage"];
    }


    var data = purchase.toObject(); //trim unnecessary data

    return purchase.save((err) => {
      cbf(cb, err, data);
    }); //eo purchase.save
  });// eo purchase.find
};

// DELETE
api.deletePurchase = function (id, cb) {
  return Purchase.findById(id).remove().exec((err, purchase) => {
    var data = 'The purchase got Deleted';
    if (err) data = 'Error in deleting this purchase';
    return cbf(cb, err, data);
  });
};


/*
========= [ SPECIAL METHODS ] =========
*/


//TEST
//New Callback System in TEST, which returns a ResponseClass object's Output
api.test = function (cb) {
  return l.responseCallback(cb, false, { name: 'dummyValue' });
};

//DELETE ALL
api.deleteAllPurchases = function (cb) {
  return Purchase.remove({}, (err) => {
    var data = 'All purchases got Deleted';
    if (err) data = 'Error in deleting all purchases';
    return cbf(cb, err, data);
  });
};


// SEARCH
api.searchPurchases = function (skip, limit, keywordObj, strict, cb) {
  var k = {};

  if (strict) {
    k = keywordObj;
  } else {
    Object.keys(keywordObj).forEach(function (key, index) {
      k[key] = new RegExp(keywordObj[key], 'i');
    });
  }

  var q = Purchase.find(k)

  if (skip != undefined)
    q.skip(skip * 1);

  if (limit != undefined)
    q.limit(limit * 1);

  return q.exec((err, purchases) => {
    cbf(cb, err, purchases)
  });
};



module.exports = api;


// {
// 	"status": 0,
// 	"environment": "Sandbox",
// 	"receipt": {
// 		"receipt_type": "ProductionSandbox",
// 		"adam_id": 0,
// 		"app_item_id": 0,
// 		"bundle_id": "com.rebelecrew.soccerapp",
// 		"application_version": "209001",
// 		"download_id": 0,
// 		"version_external_identifier": 0,
// 		"receipt_creation_date": "2017-07-28 11:21:17 Etc/GMT",
// 		"receipt_creation_date_ms": "1501240877000",
// 		"receipt_creation_date_pst": "2017-07-28 04:21:17 America/Los_Angeles",
// 		"request_date": "2017-07-28 11:50:39 Etc/GMT",
// 		"request_date_ms": "1501242639931",
// 		"request_date_pst": "2017-07-28 04:50:39 America/Los_Angeles",
// 		"original_purchase_date": "2013-08-01 07:00:00 Etc/GMT",
// 		"original_purchase_date_ms": "1375340400000",
// 		"original_purchase_date_pst": "2013-08-01 00:00:00 America/Los_Angeles",
// 		"original_application_version": "1.0",
// 		"in_app": [
// 			{
// 				"quantity": "1",
// 				"product_id": "com.sportimo.subscription.weekly",
// 				"transaction_id": "1000000319656884",
// 				"original_transaction_id": "1000000319656884",
// 				"purchase_date": "2017-07-28 11:21:16 Etc/GMT",
// 				"purchase_date_ms": "1501240876000",
// 				"purchase_date_pst": "2017-07-28 04:21:16 America/Los_Angeles",
// 				"original_purchase_date": "2017-07-28 11:21:17 Etc/GMT",
// 				"original_purchase_date_ms": "1501240877000",
// 				"original_purchase_date_pst": "2017-07-28 04:21:17 America/Los_Angeles",
// 				"expires_date": "2017-07-28 11:24:16 Etc/GMT",
// 				"expires_date_ms": "1501241056000",
// 				"expires_date_pst": "2017-07-28 04:24:16 America/Los_Angeles",
// 				"web_order_line_item_id": "1000000035766301",
// 				"is_trial_period": "true"
// 			}
// 		]
// 	},
// 	"latest_receipt_info": [
// 		{
// 			"quantity": "1",
// 			"product_id": "com.sportimo.subscription.weekly",
// 			"transaction_id": "1000000319656884",
// 			"original_transaction_id": "1000000319656884",
// 			"purchase_date": "2017-07-28 11:21:16 Etc/GMT",
// 			"purchase_date_ms": "1501240876000",
// 			"purchase_date_pst": "2017-07-28 04:21:16 America/Los_Angeles",
// 			"original_purchase_date": "2017-07-28 11:21:17 Etc/GMT",
// 			"original_purchase_date_ms": "1501240877000",
// 			"original_purchase_date_pst": "2017-07-28 04:21:17 America/Los_Angeles",
// 			"expires_date": "2017-07-28 11:24:16 Etc/GMT",
// 			"expires_date_ms": "1501241056000",
// 			"expires_date_pst": "2017-07-28 04:24:16 America/Los_Angeles",
// 			"web_order_line_item_id": "1000000035766301",
// 			"is_trial_period": "true"
// 		},
// 		{
// 			"quantity": "1",
// 			"product_id": "com.sportimo.subscription.weekly",
// 			"transaction_id": "1000000319657712",
// 			"original_transaction_id": "1000000319656884",
// 			"purchase_date": "2017-07-28 11:24:16 Etc/GMT",
// 			"purchase_date_ms": "1501241056000",
// 			"purchase_date_pst": "2017-07-28 04:24:16 America/Los_Angeles",
// 			"original_purchase_date": "2017-07-28 11:21:17 Etc/GMT",
// 			"original_purchase_date_ms": "1501240877000",
// 			"original_purchase_date_pst": "2017-07-28 04:21:17 America/Los_Angeles",
// 			"expires_date": "2017-07-28 11:27:16 Etc/GMT",
// 			"expires_date_ms": "1501241236000",
// 			"expires_date_pst": "2017-07-28 04:27:16 America/Los_Angeles",
// 			"web_order_line_item_id": "1000000035766302",
// 			"is_trial_period": "false"
// 		},
// 		{
// 			"quantity": "1",
// 			"product_id": "com.sportimo.subscription.weekly",
// 			"transaction_id": "1000000319658031",
// 			"original_transaction_id": "1000000319656884",
// 			"purchase_date": "2017-07-28 11:27:16 Etc/GMT",
// 			"purchase_date_ms": "1501241236000",
// 			"purchase_date_pst": "2017-07-28 04:27:16 America/Los_Angeles",
// 			"original_purchase_date": "2017-07-28 11:21:17 Etc/GMT",
// 			"original_purchase_date_ms": "1501240877000",
// 			"original_purchase_date_pst": "2017-07-28 04:21:17 America/Los_Angeles",
// 			"expires_date": "2017-07-28 11:30:16 Etc/GMT",
// 			"expires_date_ms": "1501241416000",
// 			"expires_date_pst": "2017-07-28 04:30:16 America/Los_Angeles",
// 			"web_order_line_item_id": "1000000035766331",
// 			"is_trial_period": "false"
// 		},
// 		{
// 			"quantity": "1",
// 			"product_id": "com.sportimo.subscription.weekly",
// 			"transaction_id": "1000000319659009",
// 			"original_transaction_id": "1000000319656884",
// 			"purchase_date": "2017-07-28 11:30:16 Etc/GMT",
// 			"purchase_date_ms": "1501241416000",
// 			"purchase_date_pst": "2017-07-28 04:30:16 America/Los_Angeles",
// 			"original_purchase_date": "2017-07-28 11:21:17 Etc/GMT",
// 			"original_purchase_date_ms": "1501240877000",
// 			"original_purchase_date_pst": "2017-07-28 04:21:17 America/Los_Angeles",
// 			"expires_date": "2017-07-28 11:33:16 Etc/GMT",
// 			"expires_date_ms": "1501241596000",
// 			"expires_date_pst": "2017-07-28 04:33:16 America/Los_Angeles",
// 			"web_order_line_item_id": "1000000035766378",
// 			"is_trial_period": "false"
// 		},
// 		{
// 			"quantity": "1",
// 			"product_id": "com.sportimo.subscription.weekly",
// 			"transaction_id": "1000000319660156",
// 			"original_transaction_id": "1000000319656884",
// 			"purchase_date": "2017-07-28 11:33:16 Etc/GMT",
// 			"purchase_date_ms": "1501241596000",
// 			"purchase_date_pst": "2017-07-28 04:33:16 America/Los_Angeles",
// 			"original_purchase_date": "2017-07-28 11:21:17 Etc/GMT",
// 			"original_purchase_date_ms": "1501240877000",
// 			"original_purchase_date_pst": "2017-07-28 04:21:17 America/Los_Angeles",
// 			"expires_date": "2017-07-28 11:36:16 Etc/GMT",
// 			"expires_date_ms": "1501241776000",
// 			"expires_date_pst": "2017-07-28 04:36:16 America/Los_Angeles",
// 			"web_order_line_item_id": "1000000035766432",
// 			"is_trial_period": "false"
// 		},
// 		{
// 			"quantity": "1",
// 			"product_id": "com.sportimo.subscription.weekly",
// 			"transaction_id": "1000000319661016",
// 			"original_transaction_id": "1000000319656884",
// 			"purchase_date": "2017-07-28 11:36:16 Etc/GMT",
// 			"purchase_date_ms": "1501241776000",
// 			"purchase_date_pst": "2017-07-28 04:36:16 America/Los_Angeles",
// 			"original_purchase_date": "2017-07-28 11:21:17 Etc/GMT",
// 			"original_purchase_date_ms": "1501240877000",
// 			"original_purchase_date_pst": "2017-07-28 04:21:17 America/Los_Angeles",
// 			"expires_date": "2017-07-28 11:39:16 Etc/GMT",
// 			"expires_date_ms": "1501241956000",
// 			"expires_date_pst": "2017-07-28 04:39:16 America/Los_Angeles",
// 			"web_order_line_item_id": "1000000035766486",
// 			"is_trial_period": "false"
// 		}
// 	],
// 	"latest_receipt": "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",
// 	"pending_renewal_info": [
// 		{
// 			"expiration_intent": "1",
// 			"auto_renew_product_id": "com.sportimo.subscription.weekly",
// 			"is_in_billing_retry_period": "0",
// 			"product_id": "com.sportimo.subscription.weekly",
// 			"auto_renew_status": "0"
// 		}
// 	]
// }