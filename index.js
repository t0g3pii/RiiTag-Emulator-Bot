process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const {
    AttachmentBuilder,
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    SlashCommandBuilder,
    MessageFlags
} = require("discord.js");
const fs = require("fs");
const axios = require("axios").default;
const path = require("path");
var mysql = require("mysql");

if (!fs.existsSync("./config.json")) {
    fs.copyFileSync("./config.template.json", "./config.json");
    console.log("Update your token in config.json and restart the bot");
    process.exit();
}

const config = JSON.parse(fs.readFileSync("./config.json"));
const switchRpcApplicationIds = new Set(
    Array.isArray(config.switchRpcApplicationIds)
        ? config.switchRpcApplicationIds.map(id => id.toString())
        : []
);

var pool = mysql.createPool({
  host     : config.host,
  user     : config.user,
  password : config.password,
  database : config.database,
  connectionLimit: 10
});

const RIITAG_BASE_URL = "https://riitag.t0g3pii.de";

const rest = new REST({ version: "10" }).setToken(config.token);

const bot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

async function registerSlashCommands() {
    if (!config.clientId) {
        console.warn("clientId fehlt in config.json – Slash-Commands werden nicht registriert.");
        return;
    }

    const commands = [
        new SlashCommandBuilder()
            .setName("riitag")
            .setDescription("Shows the RiiTag of a user")
            .addUserOption(option =>
                option
                    .setName("user")
                    .setDescription("Discord user, whose RiiTag should be shown")
                    .setRequired(false)
            )
            .addStringOption(option =>
                option
                    .setName("id")
                    .setDescription("Discord ID, if no user can be selected")
                    .setRequired(false)
            )
            .toJSON()
    ];

    try {
        //await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
        console.log("Slash commands successfully registered.");
    } catch (error) {
        console.error("Registering slash commands failed:", error);
    }
}

bot.once("clientReady", () => {
    console.log("Bot connected");
    registerSlashCommands();
});

bot.on("presenceUpdate", (_, presence) => {
    presence.activities.forEach(async activity => {
        if (activity.name == "Dolphin Emulator") {
            const gameRegex = /(.*)\((.*)\)/;
            const regexRes = gameRegex.exec(activity.details);
            if (!regexRes) return;
            let gameID = regexRes[2];
            if (gameID.includes(",")) {
                gameID = gameID.split(",")[0];
                console.log(gameID);
            }
            console.log(gameID);
            if (gameID.length > 6) {
                console.log(`${presence.user.username} is playing a game that isn't available on RiiTag.`);
                return;
            }
            if (gameID) {
                var key = await getKey(presence.user.id);
                console.log(key);
                if (!key) {
                    console.log(`${presence.user.username} does not have a registered account on RiiTag.`);
                    return;
                }
                try {
                    var url = `${RIITAG_BASE_URL}/wii?key=${key}&game=${gameID}`;
                    //console.log(url);
                    var res = await axios.get(encodeURI(url));
                    if (res.status == 200) {
                        console.log(`${presence.user.username} is now playing ${activity.details}.`);
                    } else {
                        console.log(`Request for ${presence.user.username} failed with response code ${res.status} for game ${activity.details}.`);
                    }
                } catch (error) {
                    console.log(`Error occurred during the request for dolphin emulator presence update: ${error.message}`);
                }
            } else {
                console.log("No Game ID detected for dolphin emulator presence update");
            }
        } else if (activity.name == "citra" || activity.name == "Nintendo 3DS" || activity.name.includes("(3DS)") || activity.name.includes("-3DS")) {
            let currGame;
            if (activity.name == "citra") {
                currGame = activity.state;
            }
            if (activity.name == "Nintendo 3DS") {
                currGame = activity.details;
            }
            if (activity.name.includes("(3DS)")) {
                currGame = activity.name.replace(" (3DS)", "");
            }
            if (currGame) {
                currGame = currGame.replace(/&/g, "%26").replace("\n", " ");
                var key = await getKey(presence.user.id);
                if (!key) {
                    console.log(`${presence.user.username} does not have a registered account on RiiTag.`);
                    return;
                }

                try {
                    var url = `${RIITAG_BASE_URL}/3ds?key=${key}&gameName=${currGame}`;
                    //console.log(url);
                    var res = await axios.get(encodeURI(url));
                    if (res.status == 200) {
                        console.log(`${presence.user.username} is now playing ${currGame}.`);
                    } else {
                        console.log(`Request for ${presence.user.username} failed with response code ${res.status} for game ${currGame}.`);
                    }
                } catch (error) {
                    console.log(`Error occurred during the request for citra presence update: ${error.message}`);
                }
            } else {
                console.log("No Game detected for citra presence update");
            }
        } else if (activity.name == "Cemu") {
            let currGame = activity.state;
            if ( currGame && currGame != "Idling" ) {
                currGame = currGame.replace("Playing", "").trim().replace(/&/g, "%26");
                var key = await getKey(presence.user.id);
                if (!key) {
                    console.log(`${presence.user.username} does not have a registered account on RiiTag.`);
                    return;
                }
                try {
                    var url = `${RIITAG_BASE_URL}/wiiu?key=${key}&origin=Cemu&gameTID=${currGame}`;
                    //console.log(url);
                    var res = await axios.get(encodeURI(url));
                    if (res.status == 200) {
                        console.log(`${presence.user.username} is now playing ${currGame}.`);
                    } else {
                        console.log(`Request for ${presence.user.username} failed with response code ${res.status} for game ${currGame}.`);
                    }
                } catch (error) {
                    console.log(`Error occurred during the request for cemu presence update: ${error.message}`);
                }
            } else {
                console.log("No Game detected for cemu presence update");
            }
        } else if (activity.name == "Yuzu") {
            let currGame = activity.state;
            if ( currGame && currGame != "Currently not in game" ) {
                currGame = currGame.trim().replace(/&/g, "%26");
                var key = await getKey(presence.user.id);
                if (!key) {
                    console.log(`${presence.user.username} does not have a registered account on RiiTag.`);
                    return;
                }
                var url = `${RIITAG_BASE_URL}/switch?key=${key}&game=${currGame}&source=Yuzu`;
                //console.log(url);
                var res = await axios.get(encodeURI(url));
                if (res.status == 200) {
                    console.log(`${presence.user.username} is now playing ${activity.state}.`);
                } else {
                    console.log(`Request for ${presence.user.username} failed with response code ${res.status} for game ${activity.state}} for yuzu.`);
                }
            } else {
                console.log("No Game detected for yuzu presence update");
            }
        } else if (activity.name == "Ryujinx") {
            let currGame = activity.state;
            if ( currGame && currGame != "Idling" ) {
                currGame = currGame.replace("Playing", "").trim().replace(/&/g, "%26");
                var key = await getKey(presence.user.id);
                if (!key) {
                    console.log(`${presence.user.username} does not have a registered account on RiiTag.`);
                    return;
                }
                var url = `${RIITAG_BASE_URL}/switch?key=${key}&game=${currGame}&source=Ryujinx`;
                //console.log(url);
                var res = await axios.get(encodeURI(url));
                if (res.status == 200) {
                    console.log(`${presence.user.username} is now playing ${activity.state}.`);
                } else {
                    console.log(`Request for ${presence.user.username} failed with response code ${res.status} for game ${activity.state}} for ryujinx.`);
                }
            } else {
                console.log("No Game detected for ryujinx presence update");
            }
        } else if (activity.name == "Nintendo Switch" || activity.name == "Switch") {
            let currGame;
            if (activity.name == "Nintendo Switch") {
                currGame = activity.details;
            }
            if (activity.name == "Switch") {
                currGame = activity.details.replace("Playing ", "");
            }
            if (currGame) {
                currGame = currGame.replace(/&/g, "%26").replace("\n", " ");
                var key = await getKey(presence.user.id);
                if (!key) {
                    console.log(`${presence.user.username} does not have a registered account on RiiTag.`);
                    return;
                }

                try {
                    var url = `${RIITAG_BASE_URL}/switch?key=${key}&gameName=${currGame}`;
                    //console.log(url);
                    var res = await axios.get(encodeURI(url));
                    if (res.status == 200) {
                        console.log(`${presence.user.username} is now playing ${currGame}.`);
                    } else {
                        console.log(`Request for ${presence.user.username} failed with response code ${res.status} for game ${currGame}.`);
                    }
                } catch (error) {
                    console.log(`Error occurred during the request for switch presence update: ${error.message}`);
                }
            } else {
                console.log("No Game detected for switch presence update");
            }
        } else if (
            // Switch RPC fallback: known applicationId or heuristic via assets.largeText
            (
                (activity.applicationId && switchRpcApplicationIds.has(activity.applicationId.toString())) ||
                (activity.assets && typeof activity.assets.largeText === 'string' && /nintendo switch/i.test(activity.assets.largeText))
            )
        ) {
            let currGame = activity.name;
            if (currGame) {
                currGame = currGame.replace(/&/g, "%26").replace("\n", " ");
                var key = await getKey(presence.user.id);
                if (!key) {
                    console.log(`${presence.user.username} does not have a registered account on RiiTag.`);
                    return;
                }
                try {
                    var url = `${RIITAG_BASE_URL}/switch?key=${key}&gameName=${currGame}`;
                    var res = await axios.get(encodeURI(url));
                    if (res.status == 200) {
                        console.log(`${presence.user.username} is now playing ${currGame}.`);
                    } else {
                        console.log(`Request for ${presence.user.username} failed with response code ${res.status} for game ${currGame}.`);
                    }
                } catch (error) {
                    console.log(`Error occurred during the request for switch presence update (RPC app): ${error.message}`);
                }
            } else {
                console.log("No Game detected for switch presence update (RPC app)");
            }
        }
    });
});

bot.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "riitag") {
        return;
    }

    const userOption = interaction.options.getUser("user");
    const idOption = interaction.options.getString("id");

    let targetId = userOption?.id ?? null;

    if (!targetId && idOption) {
        const sanitized = sanitizeDiscordId(idOption);
        if (/^\d{17,20}$/.test(sanitized)) {
            targetId = sanitized;
        } else {
            await interaction.reply({ content: "Please provide a valid Discord ID.", flags: MessageFlags.Ephemeral });
            return;
        }
    }

    if (!targetId) {
        await interaction.reply({ content: "Please provide a user or a Discord ID.", flags: MessageFlags.Ephemeral });
        return;
    }

    const displayLabel = userOption
        ? (userOption.discriminator === "0" ? `@${userOption.username}` : userOption.tag)
        : targetId;
    const imageUrl = `${RIITAG_BASE_URL}/${targetId}/tag.max.png`;

    try {
        await interaction.deferReply();
        const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
        const attachment = new AttachmentBuilder(Buffer.from(response.data), { name: `riitag-${targetId}.png` });
        await interaction.editReply({ content: `RiiTag for <@${targetId}>`, files: [attachment] });
        console.log(`RiiTag for ${targetId} requested by ${interaction.user.username}`);
    } catch (error) {
        console.log(`Error occurred during the request: ${error.message}`);
        const status = error.response?.status;
        const message = status === 404
            ? "For this user no RiiTag was found."
            : "An error occurred while retrieving the RiiTag.";

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: message });
        } else {
            await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
        }
    }
});

bot.on("messageReactionAdd", async (reaction, user) => {
    try {
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();
    } catch (err) {
        console.warn("Could not resolve reaction partial:", err);
        return;
    }

    if (!reaction.message || !reaction.message.author || !bot.user) return;
    if (user && user.bot) return;

    if (reaction.message.author.id === bot.user.id && reaction.emoji.name === "🚫") {
        console.log(`${user?.username || "Unknown"} opted out of future RiiTag requests.`);
        // Hier ggf. Persistenz/Opt-out-Logik ergänzen
    }
});

function sanitizeDiscordId(input) {
    return input.replace(/[<@!>]/g, "").trim();
}

function saveConfig() {
    fs.writeFileSync("config.json", JSON.stringify(config, null, 4));
}

async function getKey(id) {
    return new Promise((resolve, reject) => {
        pool.query("SELECT randkey FROM `user` WHERE `username` = ?", [id], function (err, res) {
            if (err) return reject(err);
            if (!res || res.length === 0 || !res[0] || !res[0].randkey) return resolve(null);
            return resolve(res[0].randkey);
        });
    });
}

bot.login(config.token);
