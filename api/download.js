import axios from "axios";

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({
      ok: false,
      message: "url kosong"
    });
  }

  try {
    const { data } = await axios.get(
      "https://api.azbry.com/api/download/allinone",
      {
        params: { url },
        timeout: 30000
      }
    );

    if (!data.status) {
      return res.status(400).json({
        ok: false,
        message: "gagal download"
      });
    }

    return res.json({
      ok: true,
      source: data.result.source,
      title: data.result.title,
      author: data.result.author,
      thumbnail: data.result.thumbnail,
      duration: data.result.duration,
      medias: data.result.medias
    });

  } catch (err) {
    console.error(err.response?.data || err.message);

    return res.status(502).json({
      ok: false,
      message: "TAUTAN TIDAK DAPAT DIPROSES",
      error: err.message
    });
  }
}