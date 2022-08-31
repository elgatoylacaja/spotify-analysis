// Este programa sirve para descargarse los preview_url de los temas 
// utilizando el export de aristas del archivo gephi

const express = require('express');
const app = express();
const csv = require('csv-parser');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
var axios = require('axios');

// CSVWriter es la librería que uso para escribir un nuevo csv
const csvWriter = createCsvWriter({
    path: 'final.csv',
    header: [
        {id: 'source', title: 'source'},
        {id: 'target', title: 'target'},
        {id: 'edge_track_name', title: 'edge_track_name'},
        {id: 'spotify_track_name', title: 'spotify_track_name'},
        {id: 'spotify_artists', title: 'spotify_artists'},
        {id: 'track_name_coincides', title: 'track_name_coincides'},
        {id: 'artists_coincides', title: 'artists_coincides'},
        {id: 'id', title: 'id'},
        {id: 'preview', title: 'preview'},
        {id: 'error', title: 'error'}
    ],
});

app.use(express.urlencoded({ extended: false }));

app.get('/scrape', async (req, res) => {
    // Resultados del csv previo
    const results = [];

    // Leemos el CSV previo (si tenemos uno)
    // Esto no es obligatorio pero lo hago para no repetir llamados a la API que no sean necesarios
    fs.createReadStream('almost_final.csv')
        .pipe(csv({}))
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            // Recibo el json de edges que sacamos de gephi
            const rawdata = fs.readFileSync('edges.json');
            const edges = JSON.parse(rawdata);

            const themes = await getIDs(edges, results, '[SPOTIFY_API_TOKEN]');
            saveCSV(themes);
            console.log('length: ' + themes.length);
            fs.writeFile("output.json", JSON.stringify(themes), 'utf8', function (err) {
                if (err) {
                    console.log("An error occured while writing JSON Object to File.");
                    return console.log(err);
                }
             
                console.log("JSON file has been saved.");
            });
            console.log('...Done')
            res.send('OK');
    });
});

async function saveCSV(themes) {
    await csvWriter.writeRecords(themes)
}

async function getIDs(edges, prevData, token){
    const themes = [];

    for (const edge of edges) {
        const alreadyExisting = prevData.find(x => x.source === edge.source && x.target === edge.target);

        if(alreadyExisting) {
            themes.push(alreadyExisting);
            console.log(themes.length);
            continue;
        }

        let theme = await getSpotifyData(edge, token);

        if(theme.error === 'not found') {
            theme = await getSpotifyData(edge, token, true);
        }else if(theme.error === 'request error') {
            theme = await getSpotifyData(edge, token);

            if(theme.error === 'not found') {
                theme = await getSpotifyData(edge, token, true);
            }
        }

        themes.push(theme);
        console.log(themes.length + ' - ' + theme.error);
    }

    return themes;
}

async function getSpotifyData(edge, token, hideArtist = false) {
    try {
        const query = `track:${edge.colab_track_name} ${!hideArtist ? `artist:${edge.source} ${edge.target}` : ''}`;
        const response = await axios.get(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=25`, 
            {
                headers: { 
                    'Authorization': `Bearer ${token}`, 
                    'Content-Type': 'application/json'
                },   
            }
        );

        if(
            response.data 
            && response.data.tracks 
            && response.data.tracks.items 
            && response.data.tracks.items.length 
        ) {
            let sresult = response.data.tracks.items.find(x => {
                const dataCoincides = getDataCoincides(edge, x);
                return dataCoincides.sourceExists && dataCoincides.sourceTarget && dataCoincides.trackNameCoincides;
            });

            if(!sresult) sresult = response.data.tracks.items[0];

            const dataCoincides = getDataCoincides(edge, sresult);
            let preview_url = sresult.preview_url ? sresult.preview_url : false;

            if(!preview_url) {
                try {
                    const response = await axios.get(
                        `https://api.spotify.com/v1/tracks/${sresult.id}`, 
                        {
                            headers: { 
                                'Authorization': `Bearer ${token}`, 
                                'Content-Type': 'application/json'
                            },   
                        }
                    );
        
                    const prev_url = response.data && response.data.preview_url;
                    if(prev_url) preview_url = prev_url;
                } catch (e) {} 
            }

            return {
                source: edge.source,
                target: edge.target,
                edge_track_name: edge.colab_track_name,
                spotify_track_name: sresult.name,
                spotify_artists: dataCoincides.artistasSpotify.join(", "),
                track_name_coincides: dataCoincides.trackNameCoincides,
                artists_coincides: dataCoincides.sourceExists && dataCoincides.sourceTarget,
                id: sresult.id,
                preview: preview_url,
                error: '',
            }   
        }else {
            return {
                source: edge.source,
                target: edge.target,
                edge_track_name: edge.colab_track_name,
                spotify_track_name: '',
                spotify_artists: '',
                track_name_coincides: '',
                artists_coincides: '',
                id: '',
                preview: false,
                error: 'not found',
            }
        }            
    } catch (e) {
        console.log(e);
        return {
            source: edge.source,
            target: edge.target,
            edge_track_name: edge.colab_track_name,
            spotify_track_name: '',
            spotify_artists: '',
            track_name_coincides: '',
            artists_coincides: '',
            id: '',
            preview: false,
            error: 'request error',
        }
    } 
}

function getDataCoincides(edge, result) {
    const artistasSpotify = result.artists.map(x => x.name);
    const sourceExists = artistasSpotify.some(x => x.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === edge.source.replace(/[^a-zA-Z0-9]/g, '').toUpperCase());
    const sourceTarget = artistasSpotify.some(x => x.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === edge.target.replace(/[^a-zA-Z0-9]/g, '').toUpperCase());
    const trackNameCoincides = result.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() == edge.colab_track_name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    return {
        sourceExists,
        sourceTarget,
        trackNameCoincides,
        artistasSpotify
    }
}


const csvWriterClean = createCsvWriter({
    path: 'edges-full-clean.csv',
    header: [
        {id: '', title: ''},
        {id: 'source', title: 'source'},
        {id: 'target', title: 'target'},
        {id: 'weight', title: 'weight'},
        {id: 'track_name', title: 'track_name'},
        {id: 'artists', title: 'artists'},
        {id: 'preview', title: 'preview'},
        {id: 'source_id', title: 'source_id'},
        {id: 'target_id', title: 'target_id'},
        {id: 'track_id', title: 'track_id'}
    ],
});

app.get('/clean', async (req, res) => {
    const results = [];
    fs.createReadStream('edges-full.csv')
        .pipe(csv({}))
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            const newArray = [];
            results.forEach(element => {
                if(!newArray.some(x => 
                    (x.source_id === element.source_id && x.target_id === element.target_id)
                    || (x.source_id === element.target_id && x.target_id === element.source_id)
                )) {
                    newArray.push(element);
                } 
            });

            for (let index = 0; index < newArray.length; index++) {
                newArray[index][''] = index;
            }

            await csvWriterClean.writeRecords(newArray);
            console.log('...Done')
            res.send('OK');
    });
});

app.listen(process.env.PORT || 5000);