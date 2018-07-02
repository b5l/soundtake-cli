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
    .description('This script uses the www.soundtake.net service to batch download any SoundCloud content.')
    .option('-u, --url [url]', 'The SoundCloud URL you want to download')
    .option('-d, --output [directory]', 'The directory to download the files into')
    .parse(process.argv);

if (!program.url)
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
        
        let req = https.request(options, res => {
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
    
    let req = https.get(links[index], res => {
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
        if (program.output && !fs.existsSync(program.output))
            fs.mkdirSync(program.output);

        let req = http.get(link, res => {
            let filename = /filename=\"(.*)\"/gi.exec(res.headers['content-disposition'])[1].replace(/[/\\?%*:|"<>]/g, '-').replace(' [soundtake.net]', ''),
                file = fs.createWriteStream(program.output ? `${program.output}/${filename}` : filename),
                contentLength = parseInt(res.headers['content-length'], 10),
                downloaded = 0;

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