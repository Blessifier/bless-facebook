import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import { nanoid } from 'nanoid';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const API_SECRET = process.env.API_SECRET || 'change-this-secret';
const PORT = process.env.PORT || 3000;
const DB_FILE = './keys.json';

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID in environment variables.');
}

function loadKeys() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '{}');
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveKeys(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }
function parseDuration(duration) {
  if (!duration) return null;
  const d = duration.toLowerCase();
  if (d === 'lifetime' || d === 'life') return 'lifetime';
  const match = d.match(/^(\d+)(d|day|days|w|week|weeks|mo|month|months|y|year|years)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  const date = new Date();
  if (unit.startsWith('d')) date.setDate(date.getDate() + amount);
  else if (unit.startsWith('w')) date.setDate(date.getDate() + amount * 7);
  else if (unit.startsWith('mo') || unit.startsWith('month')) date.setMonth(date.getMonth() + amount);
  else if (unit.startsWith('y')) date.setFullYear(date.getFullYear() + amount);
  return date.toISOString();
}
function makeKey() { return `WFL-${nanoid(6).toUpperCase()}-${nanoid(6).toUpperCase()}`; }
function keyStatus(record) {
  if (!record) return { valid: false, reason: 'Key not found' };
  if (record.revoked) return { valid: false, reason: 'Key revoked' };
  if (record.expiresAt !== 'lifetime' && new Date(record.expiresAt) < new Date()) return { valid: false, reason: 'Key expired' };
  return { valid: true, reason: 'Valid key' };
}

const commands = [
  new SlashCommandBuilder().setName('key-create').setDescription('Create a license key')
    .addStringOption(o => o.setName('duration').setDescription('1d, 7d, 30d, 1mo, 1y, lifetime').setRequired(true))
    .addUserOption(o => o.setName('user').setDescription('Discord user for this key').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('key-revoke').setDescription('Revoke a license key')
    .addStringOption(o => o.setName('key').setDescription('License key').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('key-info').setDescription('Check a license key')
    .addStringOption(o => o.setName('key').setDescription('License key').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('key-list').setDescription('List recent license keys')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log('Discord slash commands registered.');
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const db = loadKeys();

  if (interaction.commandName === 'key-create') {
    const duration = interaction.options.getString('duration');
    const expiresAt = parseDuration(duration);
    if (!expiresAt) return interaction.reply({ content: 'Invalid duration. Use 1d, 7d, 30d, 1mo, 1y, or lifetime.', ephemeral: true });
    const user = interaction.options.getUser('user');
    const key = makeKey();
    db[key] = { key, userId: user?.id || null, createdBy: interaction.user.id, createdAt: new Date().toISOString(), expiresAt, revoked: false, activations: [] };
    saveKeys(db);
    return interaction.reply({ content: `Created key:\n\`${key}\`\nExpires: **${expiresAt}**`, ephemeral: true });
  }

  if (interaction.commandName === 'key-revoke') {
    const key = interaction.options.getString('key');
    if (!db[key]) return interaction.reply({ content: 'Key not found.', ephemeral: true });
    db[key].revoked = true;
    saveKeys(db);
    return interaction.reply({ content: `Revoked: \`${key}\``, ephemeral: true });
  }

  if (interaction.commandName === 'key-info') {
    const key = interaction.options.getString('key');
    const rec = db[key];
    const status = keyStatus(rec);
    if (!rec) return interaction.reply({ content: 'Key not found.', ephemeral: true });
    return interaction.reply({ content: `Key: \`${key}\`\nStatus: **${status.reason}**\nExpires: **${rec.expiresAt}**\nActivations: **${rec.activations.length}**`, ephemeral: true });
  }

  if (interaction.commandName === 'key-list') {
    const keys = Object.values(db).slice(-10).reverse();
    if (!keys.length) return interaction.reply({ content: 'No keys yet.', ephemeral: true });
    return interaction.reply({ content: keys.map(k => `\`${k.key}\` - ${keyStatus(k).reason} - ${k.expiresAt}`).join('\n'), ephemeral: true });
  }
});

const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('Williams Facebook Lister license API is online.'));
app.post('/api/validate', (req, res) => {
  const { key, deviceId, apiSecret } = req.body || {};
  if (apiSecret !== API_SECRET) return res.status(401).json({ valid: false, reason: 'Bad API secret' });
  const db = loadKeys();
  const rec = db[key];
  const status = keyStatus(rec);
  if (status.valid) {
    rec.activations.push({ deviceId: deviceId || 'unknown', at: new Date().toISOString() });
    rec.lastUsedAt = new Date().toISOString();
    saveKeys(db);
  }
  return res.json({ valid: status.valid, reason: status.reason, expiresAt: rec?.expiresAt || null });
});

app.listen(PORT, () => console.log(`API running on port ${PORT}`));
registerCommands().catch(console.error);
client.login(TOKEN);
