// Express generated dependencies
var express = require('express');
var path = require('path');
const request = require('request-promise-native');
const hubspot = require('@hubspot/api-client');
const NodeCache = require('node-cache');
const session = require('express-session');
const opn = require('open');

// Additional dependencies

/// Environment variables
require('dotenv').config()// {path: __dirname + '/.env' } );
const _ = require('lodash');

/// To parse POST
var bodyParser = require('body-parser');
var multer = require('multer');
var upload = multer();
const TOKENS = {"24267080": process.env.PRIVATE_ACCESS_TOKEN_24267080, "27172026": process.env.PRIVATE_ACCESS_TOKEN_27172026} ;
const SERVER_URL = process.env.SERVER_URL;

var app = express();

// [1.9.0+] For Heroku instances, they should return a response within 30 seconds to avoid getting stuck with the 503 error.
if (process.env.WPD_TIMEOUT) {
  var ms = require('ms');
  _timeout = '' + process.env.WPD_TIMEOUT;
  app.set('connectionTimeout', ms(_timeout));
  var timeout = require('connect-timeout'); // @see https://github.com/expressjs/timeout
  app.use(timeout(_timeout));
}

var compression = require('compression');
app.use(compression({}));
app.enable('trust proxy');  // for Heroku environments to detect whether the scheme is https or not.

// Custom Data
app.set('config', require('./config/project'));

/// Temporary directories
const tempDirectory = require('temp-dir');
const tempDirPath = tempDirectory + path.sep + 'web-page-dumper';
require('./app/temp-dirs')(app, tempDirPath);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// Logger
/// Morgan
require('./app/log/loggerWinstonForMorgan.js')(app, tempDirPath);
/// Browser Activities
/// Debug Memory Leaks

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
var cookieParser = require('cookie-parser');
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Dependencies to handle forms
/// for parsing application/json
app.use(bodyParser.json());

/// for parsing application/xwww-
app.use(bodyParser.urlencoded({ extended: true }));
///form-urlencoded

/// for parsing multipart/form-data
app.use(upload.array());
app.use(express.static('public'));

// Custom properties
const Debug = require('./utility/debug.js');
app.use(function (req, res, next) {
  req.debug = new Debug;
  next();
});

app.get('/contact', async (req, res) => {
  //res.setHeader('Content-Type', 'text/html');
  //res.write(`<h2>HubSpot PdfConvert App</h2>`);
  const company_id= _.get(req, "query.company_id")
  const PRIVATE_ACCESS_TOKEN = TOKENS[company_id] || TOKENS["24267080"]
  const contact = await getContact(PRIVATE_ACCESS_TOKEN, _.get(req, "query.email"));
  //res.write(`<h4>Access token: ${accessToken}</h4>`);
  res.json(contact)//displayContactName(res, contact);
  res.end();
});

app.get('/init', async (req, res) => {
  console.log('/init req.query', req.query);
  res.setHeader('Content-Type', 'text/html');
  const company_id= _.get(req, "query.company_id")
  const PRIVATE_ACCESS_TOKEN = TOKENS[company_id] || TOKENS["24267080"]
  if (PRIVATE_ACCESS_TOKEN) { 
    const init = await initCompany(PRIVATE_ACCESS_TOKEN)
    res.write(`<h4> Done initial PDFConvert setup</h4>`);
  }
  else
    res.write(`<h4> Error initial PDFConvert setup</h4>`);
  res.end();
});

app.get('/assign_pdf', async (req, res) => {
  console.log('/assign_pdf req.query', req.query);
  //res.setHeader('Content-Type', 'text/html');
  let clientid = _.get(req, "query.vid")
  let email = _.get(req, "query.email")
  let template_url = _.get(req, "query.template")
  const company_id = _.get(req, "query.company_id")
  const scale = _.get(req, "query.scale")
  const PRIVATE_ACCESS_TOKEN = TOKENS[company_id] || TOKENS["24267080"]
  if (PRIVATE_ACCESS_TOKEN) {
    const clientid = await getContact(PRIVATE_ACCESS_TOKEN, email)
    if (clientid > 0) {
      const folder = await createContactFolder(PRIVATE_ACCESS_TOKEN, clientid)
      const file = await getPdf(template_url, email, scale)

      let t = new URL(template_url).pathname;
      t= t.substring(0)//, t.length - 10)
      let date = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")
      let filename = `${t}-${date}.pdf`;

      const fileObject = await uploadFile(PRIVATE_ACCESS_TOKEN, clientid, file, filename)
      const fileUrl = _.get(fileObject, "url")
      const file_id = _.get(fileObject, "file_id")

      const note = await addAttachmentNote(PRIVATE_ACCESS_TOKEN, clientid, file_id)
      const result2 = await cacheContactsCard(PRIVATE_ACCESS_TOKEN, clientid, fileUrl);
      res.json({
        "message": "Pdf created succesfully!",
        "pdf": fileUrl
      })
    }
    else
      res.status(404).send({
        "message": "Error! Contact does't exists!"
      });
    //res.write(`<h4>Un-assigned Creditsafe profile to Company: ${req.query.company_id}</h4>`);
  } else {
    console.error(`       > Error for assign_company`);
    res.status(404).send({
      "message": "Error! Please contact developer!"
    });
    //res.write(`<h4>ERROR on try to assign Creditsafe profile to Company: ${req.query.company_id}</h4>`);
  }
  res.end();
});

// Routers
require('./routes/_route')(app);

// Error handler
require('./app/errorHandler.js')(app, tempDirPath);

// Periodical routines.
require('./tasks/cleanUserData')(app.get('pathDirTempUserData'));

//Hubspot

const cacheContactsCard = async (PRIVATE_ACCESS_TOKEN, clientId, card_json) => {
  console.log('=== Cache contacts for HubSpot using the access token ===');

  try {
    const hubspotClient = new hubspot.Client({ "accessToken": PRIVATE_ACCESS_TOKEN });
    const response = await hubspotClient.apiRequest({
      method: 'patch',
      path: '/crm/v3/objects/contacts/' + clientId,
      body: {
        "properties": {
          "df_generated_pdf": card_json
        }
      }
    })
    console.log(JSON.stringify(response, null, 2));
  } catch (e) {
    e.message === 'HTTP request failed'
      ? console.error(JSON.stringify(e.response, null, 2))
      : console.error(e)
  }


  return true;
};

const addAttachmentNote = async (PRIVATE_ACCESS_TOKEN, clientId, file_id) => {
  console.log('=== addAttachmentNote for HubSpot using the access token ===');

  try {
    const hubspotClient = new hubspot.Client({ "accessToken": PRIVATE_ACCESS_TOKEN });
    const response = await hubspotClient.apiRequest({
      method: 'post',
      path: '/crm/v3/objects/notes',
      body: {
        "properties": {
          "hs_timestamp": new Date().toISOString(),
          "hs_attachment_ids": file_id
        },
        "associations": [
          {
            "to": {
              "id": clientId
            },
            "types": [
              {
                "associationCategory": "HUBSPOT_DEFINED",
                "associationTypeId": 10
              }
            ]
          }
        ]
      }
    })
    console.log(JSON.stringify(response, null, 2));
  } catch (e) {
    e.message === 'HTTP request failed'
      ? console.error(JSON.stringify(e.response, null, 2))
      : console.error(e)
  }


  return true;
};

const getContact = async (PRIVATE_ACCESS_TOKEN, email) => {
  console.log('=== Retrieving a contact from HubSpot using the access token ===');
  let id = 0
  try {
    const headers = {
      Authorization: `Bearer ${PRIVATE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    };
    console.log('===> Replace the following request.get() to test other API calls');
    console.log('===> request.get(\'https://api.hubapi.com/contacts/v1/lists/all/contacts/all?count=1\')');
    const result = await request.get(`https://api.hubapi.com/crm/v3/objects/contacts/${email}?idProperty=email`, {
      headers: headers
    });
    id = _.get(JSON.parse(result), "id") || 0 // return JSON.parse(result).contacts[0];
    console.log("getContact id:", id);
  } catch (e) {
    console.error('  > Unable to retrieve contact');
    return e.response?.body;
  }
  return id;
};

const getPdf = async (url, email, scale) => {
  console.log('=== Retrieving a pdf');
  let pdf;
  scale = scale || "1"
  try {
    http://localhost:3000/www/?url=https://demohubspot.smartworkers.nl/pdf-template-test1700222658&output=pdf
    //http://localhost:3000/www/?url=https%3A%2F%2Fdemohubspot.smartworkers.nl%2Fpdf-template-test1700222658%3Fhs_preview%3DMEPmxTzR-145897991339%26email%3Dbhofman%2540ilionx.com&output=pdf
    console.log(`${SERVER_URL}/www/?cache=0&output=pdf&pdf[printBackground]=1&pdf[scale]=${scale}&url=` + encodeURIComponent(`${url}?email=${encodeURIComponent(email)}`));
    const result = await request.get(`${SERVER_URL}/www/?cache=0&output=pdf&pdf[printBackground]=1&pdf[scale]=${scale}&url=` + encodeURIComponent(`${url}?email=${encodeURIComponent(email)}`), {
      encoding: null
      //headers: headers
    });
    pdf = result
    //console.log("getPDF:", pdf);
  } catch (e) {
    console.error('  > Unable to retrieve pdf');
    return e.response?.body;
  }
  return pdf
};

const displayContactName = (res, contact) => {
  if (contact?.status === 'error') {
    res.write(`<p>Unable to retrieve contact! Error Message: ${contact.message}</p>`);
    return;
  }
  const { firstname, lastname } = contact.properties;
  res.write(`<p>Contact name: ${firstname.value} ${lastname.value}</p>`);
};

const createContactFolder = async (PRIVATE_ACCESS_TOKEN, clientid) => {
  try {
    const hubspotClient = new hubspot.Client({ "accessToken": PRIVATE_ACCESS_TOKEN });
    const FolderInput = { parentPath: "pdf", name: `${clientid}` };
    const apiResponse = await hubspotClient.files.foldersApi.create(FolderInput);
    console.log(JSON.stringify(apiResponse, null, 2));
  } catch (e) {
    e.message === 'HTTP request failed'
      ? console.error(JSON.stringify(e.response, null, 2))
      : console.error(e)
  }
}

const initCompany = async (PRIVATE_ACCESS_TOKEN) => {
  try {
    const hubspotClient = new hubspot.Client({ "accessToken": PRIVATE_ACCESS_TOKEN });
    const FolderInput = { name: `pdf` };
    const apiResponse = await hubspotClient.files.foldersApi.create(FolderInput);

    const PropertyGroupCreate = { name: "pdf", label: "pdf" };
    const objectType = "contact";

    apiResponse = await hubspotClient.crm.properties.groupsApi.create(objectType, PropertyGroupCreate);
    console.log(`createPropertyGroup`)

    const BatchInputPropertyCreate = { inputs: [{ "label": "DF Generated Pdf", "type": "string", "fieldType": "text", "groupName": "pdf", "hidden": false, "hasUniqueValue": false, "formField": false, "options": [], "name": "df_generated_pdf" }] };

    apiResponse = await hubspotClient.crm.properties.batchApi.create(objectType, BatchInputPropertyCreate);

    console.log(`createProperty`)

    console.log(JSON.stringify(apiResponse, null, 2));
  } catch (e) {
    e.message === 'HTTP request failed'
      ? console.error(JSON.stringify(e.response, null, 2))
      : console.error(e)
  }
}

const uploadFile = async (PRIVATE_ACCESS_TOKEN, clientid, file, filename) => {
  let url = {}
  try {
    const hubspotClient = new hubspot.Client({ "accessToken": PRIVATE_ACCESS_TOKEN });
    //const fileInput = { parentPath: "pdf", name: `${clientid}` };
    const response = await hubspotClient.files.filesApi.upload(
      {
        data: file, //myBuffer,//fs.createReadStream('./photo.jpg'),
        name: filename
      }, 
      undefined,
      `/pdf/${clientid}`,
      filename,
      undefined,
      JSON.stringify({
        access: 'PUBLIC_NOT_INDEXABLE',
        overwrite: true,
        duplicateValidationStrategy: 'NONE',
        duplicateValidationScope: 'ENTIRE_PORTAL',
      })
    )
    console.log(JSON.stringify(response, null, 2));
    url.url = _.get(response, "url")
    url.file_id = _.get(response, "id")

  } catch (e) {
    e.message === 'HTTP request failed'
      ? console.error(JSON.stringify(e.response, null, 2))
      : console.error(e)
  }
  console.log("url", url)
  return url;
}

const getContactId = async (PRIVATE_ACCESS_TOKEN, email) => {
  console.log('=== Get contacts for HubSpot using the access token ===', email);
  let id = 0
  try {
    const hubspotClient = new hubspot.Client({ "accessToken": PRIVATE_ACCESS_TOKEN });
    //const response = hubspotClient.crm.contacts.getAll()
    const response = await hubspotClient.apiRequest({
      method: 'GET',
      path: '/contacts/v1/contact/email/jasmine6@burch.nl/profile'
      //path: '/crm/v3/objects/contacts/' + email +"?idProperty=email",
    })
    console.log(JSON.stringify(response, null, 2));
    //id = _.get(response, "id") || 0
  } catch (e) {
    e.message === 'HTTP request failed'
      ? console.error(JSON.stringify(e.response, null, 2))
      : console.error(e)
  }
  return id;
};


function makeid(length) {
  length = length || 10
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
}

console.log(makeid(5));


module.exports = app;

