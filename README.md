
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">


</p>


# Homebridge TTLock Plugin 

Homebridge plugin for the TTLock platform.

<p align="center">


<img src="https://open.ttlock.com/resources/developer/img/logo_ttlock.a53b544e.png" width="100">

</p>

<br><br>


# Requirements
1. Lock using TTLock Platform
2. TTLock Compatible Gateway (G1, G2, G3, or G4). Successfully tested with [this one](https://www.amazon.com/gp/product/B085THR6VX).
3. TTLock app for iOS or Android 
4. Bash access to run curl command
<br><br>


# Setup Instructions

## Create TTLock Developer Account
1. Go to [TTLock Platform Registration](https://open.ttlock.com/register).
2. Complete the required information to create an account.
3. Wait for the email confirming activation of your account (manual process by TTLock).
4. Log into the TTLock Developer Platform and retreive your ClientId and ClientSecret

<br><br>

## Create a New User on Developer Account

1. Make up a new username. Creating a new user account is required! It must be associated with your developer account (unfortunately you can't use an account you've already set up on the TTLock app).
2. Come up with a password and save it somewhere. When you submit the request to create the new user, you'll have to submit the password as md5 (use [this site](https://www.md5online.org/md5-encrypt.html)).
3. Using a terminal, run this command to create the new user on your developer account:

```
curl --location --request POST 'https://api.ttlock.com/v3/user/register?clientId=[clientid]&clientSecret=[clientsecret]&username=[username]&password=[passwordasmd5]&date=CURRENTMILLIS' \
--header 'Content-Type: application/x-www-form-urlencoded' \
```
4. In the response to the request, note the username that is assigned (it will be your username prefixed with some random characters).


<br><br>


## Associate Lock and Gateway with New Account

1. Log into the TTLock iOS or Android app with your new account.
2. Add your lock(s)
3. Add the gateway (and ensure it is associated with the locks)
4. In the settings for each lock, ensure the Remote Unlock setting is set to On.

<br><br>

## Plugin Installation
Install the plugin with the following command:
```
npm install -g homebridge-ttlock
```
or install via the Homebridge UI.

<br><br>

## Configuration
```
        {
            "platform": "ttlock"
            "name": "TTLock Platform",
            "clientid": "clientid",
            "clientsecret": "clientsecret",
            "username": "username",
            "password": "passwordasmd5",
            "maximumApiRetry": 3;
        }
```

**name**: Platform display name

**clientid**: Your ClientId from the TTLock developer platform.

**clientsecret**: Your ClientSecret from the TTLock developer platform.

**username**: Username for the user account accociated with the developer account.

**password**: Password for the user account as md5.

<br>

# Usage

* On Homebridge load, plugin will get all locks from TTLock account
* Lock and unlock locks with Homekit.

# Backlog

* Get/update battery stat for each lock
* Better handle condition when gateway is busy
* Expose each lock to config and allow more customization