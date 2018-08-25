#!/usr/bin/env node
'use strict';

let fs = require('fs'),
    http = require('http'),
    https = require('https'),
    cheerio = require('cheerio'),
    program = require('commander'),
    Progress = require('progress'),
    querystring = require('querystring');

program
    .name('soundtake')
    .description('this script uses the www.soundtake.net service to batch download any SoundCloud content.')
    .option('-u, --url [url]', 'the SoundCloud URL you want to download')
    .option('-l, --destination [directory]', 'the directory to download the files into')
    .option('--proxy-host [host]', 'proxy server host')
    .option('--proxy-port [port]', 'proxy server port')
    .parse(process.argv);

if (!program.url)
    program.help();

if (program.proxyHost && !program.proxyPort)
    program.help();

getSoundTake(program.url)
    .then(downloadLinks)
    .catch(err => {
        console.error(err);
    });

function getSoundTake(url) {
    return new Promise((resolve, reject) => {
        let postData = querystring.stringify({ u: program.url }),
            options = {
                hostname: 'soundtake.net',
                port: 443,
                path: '/i/gen.php',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Content-Length': postData.length
                }
            },
            content = '';
        
        let req = https.request(program.proxyHost ? genProxyRequestOptions(options) : options, res => {
            res.on('data', d => content += d);

            res.on('end', () => {
                let $ = cheerio.load(content),
                    links = [];

                $('#kanan .track.clearfix .track-right .track-action .btn').each(
                    (i, elem) => links.push('https' + elem.attribs.href.substring(4))
                );

                resolve(links);
            });

            res.on('error', reject);
        });

        req.write(postData);
        req.end();

        req.on('error', reject);
    });
}

function downloadLinks(links, index = 0) {
    if (index >= links.length)
        return;

    let options = {
        hostname: links[index]
    }
    
    let req = https.get(/*program.proxyHost ? genProxyRequestOptions(options) : options */links[index], res => {
        downloadLink('http://' + res.headers.location.split('http://')[2])
            .then(() => downloadLinks(links, index + 1))
            .catch(err => {
                throw err;
            });

        res.on('error', err => { throw err; });
    });

    req.on('error', err => { throw err; });
}

function downloadLink(link) {
    return new Promise((resolve, reject) => {
        if (program.destination && !fs.existsSync(program.destination))
            fs.mkdirSync(program.destination);

        let req = http.get(link, res => {
            let regex = /filename=\"(.*)\"/gi.exec(res.headers['content-disposition']);

            if (regex == null) {
                console.log('Skipping song, because it has been removed from soundcloud...');
                resolve();
                return;
            }

            let filename = regex[1].replace(/[/\\?%*:|"<>]/g, '-').replace(' [soundtake.net]', ''),
                path = program.destination ? `${program.destination}/${filename}` : filename,
                file,
                contentLength = parseInt(res.headers['content-length'], 10),
                downloaded = 0;
            
            if (fs.existsSync(path) && fs.statSync(path).size == contentLength) {
                console.log(`Already downloaded ${filename}, skipping...`);
                resolve();
                return;
            }

            file = fs.createWriteStream(path);

            console.log(`${filename}:`);

            let bar = new Progress('[:bar] :percent :etas', {
                complete: '#',
                incomplete: '-',
                width: 20,
                total: contentLength
            });

            res.on('data', data => {
                file.write(data);
                downloaded += data.length;
                bar.tick(data.length);
            });

            res.on('error', reject);
            res.on('end', () => {
                file.end();
                resolve();
            });
        });

        req.on('error', reject);
    });
}

function genProxyRequestOptions(options, https, proxyHost, proxyPort) {
    let host = options.hostname,
        port = options.port,
        path = options.path;

    options.hostname = proxyHost;
    options.port = proxyPort;
    options.path = `http${https ? 's' : ''}://${host}:${port}${path}`;
    options.headers.Host = host;

    return options;
}
