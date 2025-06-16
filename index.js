require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const discordChannelIds = process.env.DISCORD_CHANNEL_IDS.split(",");
let notifiedTwitch = [];
let notifiedYouTube = [];

client.once("ready", () => {
  console.log(`Bot conectado como ${client.user.tag}`);

  checkTwitchLives();
  checkYouTubeLives();

  setInterval(() => {
    checkTwitchLives();
    checkYouTubeLives();
  }, 60 * 1000);
});

// ==== TWITCH ====

async function checkTwitchLives() {
  const usernames = process.env.TWITCH_USERNAMES.split(",");
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log("[Twitch] Client ID ou Secret não configurados.");
    return;
  }

  try {
    const tokenResponse = await axios.post(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`
    );
    const accessToken = tokenResponse.data.access_token;

    for (const username of usernames) {
      console.log(`[Twitch] Verificando se ${username} está ao vivo...`);

      const response = await axios.get(
        `https://api.twitch.tv/helix/streams?user_login=${username}`,
        {
          headers: {
            "Client-ID": clientId,
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.data.data && response.data.data.length > 0) {
        if (!notifiedTwitch.includes(username)) {
          notifiedTwitch.push(username);
          sendToAllChannels(
            `🔴 **${username} está AO VIVO na Twitch!** Assista aqui: https://www.twitch.tv/${username}`
          );
          console.log(`[Twitch] Mensagem enviada para ${username}`);
        } else {
          console.log(`[Twitch] ${username} já notificado.`);
        }
      } else {
        console.log(`[Twitch] ${username} está OFFLINE.`);
        notifiedTwitch = notifiedTwitch.filter((u) => u !== username);
      }
    }
  } catch (error) {
    console.error("[Twitch] Erro ao verificar lives:", error.message);
  }
}

// ==== YOUTUBE ====

async function getChannelIdFromUsername(username, apiKey) {
  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${username}&key=${apiKey}`;
    const response = await axios.get(url);
    if (response.data.items && response.data.items.length > 0) {
      return response.data.items[0].id;
    } else {
      console.log(`[YouTube] Username ${username} não encontrado.`);
      return null;
    }
  } catch (error) {
    console.error(
      `[YouTube] Erro ao buscar channelId do username ${username}:`,
      error.message
    );
    return null;
  }
}

const cheerio = require("cheerio");

async function checkYouTubeLives() {
  const identifiers = process.env.YOUTUBE_CHANNEL_IDS.split(",")
    .concat(process.env.YOUTUBE_USERNAMES?.split(",") || [])
    .map((i) => i.trim().replace("@", "")); // remove o @ se tiver

  for (const identifier of identifiers) {
    const handleOrId = identifier.startsWith("UC")
      ? `channel/${identifier}`
      : `@${identifier}`;
    const url = `https://www.youtube.com/${handleOrId}/live`;

    console.log(`[YouTube] Verificando: ${url}`);

    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      const html = response.data;
      const $ = cheerio.load(html);

      const canonical = $('link[rel="canonical"]').attr("href") || "";
      const isLive =
        canonical.includes("watch") && html.includes('"isLiveNow":true');

      if (isLive) {
        const videoUrl = canonical;
        if (!notifiedYouTube.includes(identifier)) {
          notifiedYouTube.push(identifier);
          sendToAllChannels(
            `🔴 **${identifier} está AO VIVO no YouTube!** Assista aqui: ${videoUrl}`
          );
          console.log(`[YouTube] Enviado: ${identifier}`);
        } else {
          console.log(`[YouTube] ${identifier} já notificado.`);
        }
      } else {
        console.log(`[YouTube] ${identifier} está OFFLINE.`);
        notifiedYouTube = notifiedYouTube.filter((id) => id !== identifier);
      }
    } catch (err) {
      console.error(`[YouTube] Erro ao verificar ${identifier}:`, err.message);
    }
  }
}

// ==== Enviar para todos os canais ====

function sendToAllChannels(message) {
  for (const id of discordChannelIds) {
    const channel = client.channels.cache.get(id);
    if (channel) {
      channel
        .send(message)
        .catch((err) =>
          console.error(
            `Erro ao enviar mensagem para o canal ${id}:`,
            err.message
          )
        );
    }
  }
}

client.login(process.env.DISCORD_TOKEN);
