#!/usr/bin/env node
import { discordClient, discordWebhookClient } from './backends/discord.js';
import { telegram, telegramGetFileURL, telegramGetProfilePic } from './backends/telegram.js';

import { enable_heroku } from './utils/heroku.js';

enable_heroku();

// import env variables
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

console.log("Telegram chat id: " + TELEGRAM_CHAT_ID);
console.log("Discord channel id: " + DISCORD_CHANNEL_ID);

// Discord -> Telegram handler
discordClient.on("message", message => {
	// the program currently check if the message's from a bot to check for duplicates.
	// This isn't the best method but it's good enough.
	// A webhook counts as a bot in the discord api, don't ask me why.
	if (message.channel.id !== DISCORD_CHANNEL_ID || message.author.bot == true) {
		return;
	}

	let mentioned_usernames = []
	for (let mention of message.mentions.users) {
		mentioned_usernames.push("@" + mention[1].username);
	}
	var attachmentUrls = []
	for (let attachment of message.attachments) {
		attachmentUrls.push(attachment[1].url);
	}

	// attachmentUrls is empty when there are no attachments so we can be just lazy
	var finalMessageContent = message.content.replace(/<@.*>/gi, '');
	// convert bold text for telegram markdown
	finalMessageContent = finalMessageContent.replace(/\*\*/g, '*');

	var text = `*\[DISCORD\] ${message.author.username} (${message.author.username}#${message.author.discriminator}):*\n`;
	text += finalMessageContent
	text += ` ${attachmentUrls.join(' ')}`;
	text += mentioned_usernames.join(" ");

	telegram.sendMessage({
		chat_id: TELEGRAM_CHAT_ID,
		text: text,
		parse_mode: 'markdown'
	});
});

// Telegram -> Discord handler
telegram.on("message", async function (message) {
	//console.log(message)
	if (message.chat.id != TELEGRAM_CHAT_ID) {
		return;
	}

	// Ignore messages from bots
	if (message.from.is_bot) {
		return;
	}

	var username = `[TELEGRAM] ${message.from.first_name}`;
	if (message.from.last_name) {
		username += ` ${message.from.last_name}`;
	}
	if (message.from.username) {
		username += ` (@${message.from.username})`;
	}

	let profileUrl = await telegramGetProfilePic(message);

	var text;
	var fileId;

	if (!message.document && !message.photo && !message.sticker) {
		if (!message.text) {
			return;
		}
		text = message.text;
	} else {
		text = message.caption;
		if (message.document) {
			fileId = message.document.file_id;
		} else if (message.sticker) {
			fileId = message.sticker.file_id;
		} else if (message.photo) {
			fileId = message.photo[2].file_id;
		}
	}

	if (text) {
		text = text.replace(/@everyone/g, "[EVERYONE]").replace(/@here/g, "[HERE]");
	}

	if (!fileId) {
		await discordWebhookClient.send(text, {
			username: username,
			avatarURL: profileUrl,
		});
	} else {
		var file = await telegram.getFile({ file_id: fileId });
		var fileUrl = telegramGetFileURL(file.file_path);
		discordWebhookClient.send(text, {
			username: username,
			avatarURL: profileUrl,
			files: [fileUrl],
		});
	};
});
