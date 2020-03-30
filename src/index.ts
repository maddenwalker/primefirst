import * as dotEnv from 'dotenv';
import * as puppeteer from 'puppeteer';
import * as dayjs from 'dayjs';
import * as nodemailer from 'nodemailer';

dotEnv.config();

const BASE_URL = process.env.BASE_URL || 'https://primenow.amazon.com';
const POSTAL_CODE = process.env.POSTAL_CODE || '94507';
const TRANSPORT = nodemailer.createTransport({
    host: process.env.NODEMAILER_HOST,
    port: process.env.NODEMAILER_PORT,
    secure: true,
    auth: {
       user: process.env.NODEMAILER_USERNAME,
       pass: process.env.NODEMAILER_PASSWORD
    }
});
const START_MESSAGE = {
    from: process.env.NODEMAILER_FROM_ADDRESS,
    to: process.env.NODEMAILER_TO_ADDRESS_NORMAL,
    subject: 'PRIME FIRST: Starting to look for times ',
    text: 'Polling begins now . . .' 
};
const FOUND_MESSAGE = {
    from: process.env.NODEMAILER_FROM_ADDRESS,
    to: process.env.NODEMAILER_TO_ADDRESS_HIGH,
    subject: 'PRIME FIRST: DELIVERY TIME FOUND',
    text: 'shortcuts://run-shortcut?name=Open%20Prime%20Now' 
};

const log = (message) => {
    console.log(dayjs().format('YYYY-MM-DD HH:mm:ss'), message);
};

const verifyEmail = function() {
    TRANSPORT.verify(function(error, _success) {
        if (error) {
          log(error);
        } else {
          log("Server is ready to take our messages");
        }
      });
}

const sendEmail = (MESSAGE) => {
    try {
        TRANSPORT.sendMail(MESSAGE, function(err, info) {
            if (err) {
                log(err)
            } else {
                log(info);
            }
        });
    } catch (error) {
        log(error);
    }
    
}

const authenticate = function() {
    return this.getPage(BASE_URL, async page => {
        await page.waitForSelector('input[name="lsPostalCode"]');

        log('auth beginning');

        const codeInput = await page.$('input[name="lsPostalCode"]');
        await codeInput.type(POSTAL_CODE, { delay: 100 });

        const codeSubmit = await page.$('.a-button-input');
        await codeSubmit.click();

        await page.waitFor(5000);

        const cartLink = await page.$('[href="/account/address"]');
        await cartLink.click();

        await page.waitFor(5000);

        const emailInput = await page.$('input[name="email"]');
        await emailInput.type(process.env.EMAIL, { delay: 100 });

        const passwordInput = await page.$('input[name="password"]');
        await passwordInput.type(process.env.PASSWORD, { delay: 100 });

        const signSubmit = await page.$('.a-button-input');
        await signSubmit.click();

        await page.waitFor(4000);

        log('auth done');
        sendEmail(START_MESSAGE);
    });
};

const cartTest = function() {
    return this.getPage(BASE_URL + '/cart', async page => {
        log('=======> checking for times <=======')

        const confirmAddress = await page.$('input[name="offer-swapping-token"]');
        if (confirmAddress) {

            const nextButton = await page.$('.a-button-input');
            await nextButton.click();

            await page.waitFor(6000);
        }

        try {
            await page.waitForSelector('.cart-checkout-button');    
        } catch (error) {
            log(error)
        }
        

        const checkoutButton = await page.$('.cart-checkout-button a');
        await checkoutButton.click();

        await page.waitFor(8000);

        const addressInput = await page.$('input[name="addressRadioButton"]');
        if (addressInput) {
            await addressInput.click();

            await page.waitFor(4000);

            const nextButton = await page.$('#shipping-address-panel-continue-button-bottom input');
            await nextButton.click();

            await page.waitFor(6000);
        }

        const deliveryOption = await page.$('input[name="delivery-window-radio"]');

        if (deliveryOption) {
             
            log('delivery options available');
            
            if (process.env.ATTEMPT_ORDER == 'true') {
                log('ordering . . .');
                
                await deliveryOption.click();
  
                const confirmButton = await page.$('.a-button-input');
                await confirmButton.click();
  
                const placeOrderButton = await page.$('.a-button-input');
                await placeOrderButton.click();
            
                log('order placed');
            }
            
            if (process.env.ALERT_VIA_EMAIL == 'true') {
                log('alerting you via email . . .');
                sendEmail(FOUND_MESSAGE);
            }

        } else {
            log('unavailable');
        }
    });
};

const createBrowser = async () => {
    let browser = await puppeteer.launch({
        headless: true,
        args: ['--lang=en-US,en'],
    });

    const getPage = async function getPage(url, fn) {
        let page: puppeteer.Page;
        let result;

        try {
            page = await browser.newPage();

            await page.setViewport({ width: 1200, height: 800 })
            await page.goto(url, { waitUntil: 'load' });

            page.on('console', msg => {
                const leng = msg.args().length;
                for (let i = 0; i < leng; i += 1) {
                    console.log(`${i}: ${msg.args()[i]}`);
                }
            });

            result = await fn(page);
            await page.close();
        } catch (e) {
            if (page) {
                await page.close();
            }

            throw e;
        }

        return result;
    };

    const close = async function close() {
        await browser.close();
        browser = null;
    };

    return {
        getPage,
        close,
        authenticate,
        cartTest,
    };
};

(async () => {
    log('init');
    verifyEmail();
    const browser = await createBrowser();
    await browser.authenticate();
    setInterval(() => {
        browser.cartTest();
    }, 30000);
})();
