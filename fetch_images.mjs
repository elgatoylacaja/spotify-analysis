import fs from "fs";
import fetch from "node-fetch";

const readFile = (fileName) => {
  return new Promise((resolve, reject) => {
    fs.readFile(fileName, "utf-8", (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

const SpotifyApi = {
  base: "https://api.spotify.com/v1",
  token: process.env.SPOTIFY_TOKEN,

  async get(path, params = {}) {
    return await fetch(
      `${this.base}${path}?${new URLSearchParams(params).toString()}`,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
      }
    )
      .then((res) => res.json())
      .catch((err) => console.log({ err }));
  },

  async getArtists(ids) {
    return await this.get(`/artists`, {
      ids: ids.join(","),
    });
  },
};

async function run() {
  const file = await readFile("./input/nodes_edges_minify.json");
  const json = JSON.parse(file);

  const groupSize = 50;
  const groups = Math.ceil(json.nodes.length / groupSize);
  const promises = Array.from({ length: groups }).map((_, i) => {
    const ids = json.nodes
      .slice(groupSize * i, groupSize * (i + 1))
      .map((a) => a.id__1);
    return SpotifyApi.getArtists(ids);
  });

  let records = {};

  await Promise.allSettled(promises).then((results) => {
    const merged = results.flatMap((res) => {
      if (res.status === "fulfilled") {
        return res.value.artists;
      } else {
        return [];
      }
    });
    records = Object.fromEntries(
      merged.map((a) => [a.id, a.images.length > 0 ? a.images[0].url : ""])
    );
  });

  const header = "id,image_url\n";
  const rows = Object.entries(records)
    .map(([id, url]) => `${id},${url}`)
    .join("\n");

  fs.writeFile("./images.csv", `${header}${rows}`, (err) => {
    if (!err) {
      console.log("Successfully wrote images.csv");
    }
  });
}

run();
