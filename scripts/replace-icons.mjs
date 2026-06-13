import { readFileSync, writeFileSync } from 'fs';

const EMOJI_MAP = {
  // Nav / UI
  '🏠': '<i class="ph ph-house"></i>',
  '💳': '<i class="ph ph-credit-card"></i>',
  '🏦': '<i class="ph ph-bank"></i>',
  '📋': '<i class="ph ph-clipboard-text"></i>',
  '🛡️': '<i class="ph ph-shield-check"></i>',
  '📈': '<i class="ph ph-trend-up"></i>',
  '📊': '<i class="ph ph-chart-bar"></i>',
  '🎓': '<i class="ph ph-graduation-cap"></i>',
  '⚡': '<i class="ph ph-lightning"></i>',
  '⚙️': '<i class="ph ph-gear"></i>',
  '+': '<i class="ph ph-plus-circle"></i>',
  '☰': '<i class="ph ph-list"></i>',
  '✕': '<i class="ph ph-x"></i>',
  '🚪': '<i class="ph ph-sign-out"></i>',
  '🎤': '<i class="ph ph-microphone"></i>',
  '🔒': '<i class="ph ph-lock"></i>',

  // Actions / Transactions
  '💰': '<i class="ph ph-money"></i>',
  '📤': '<i class="ph ph-upload-simple"></i>',
  '🔄': '<i class="ph ph-arrows-clockwise"></i>',
  '📦': '<i class="ph ph-package"></i>',
  '💡': '<i class="ph ph-lightbulb"></i>',
  '✅': '<i class="ph ph-check-circle"></i>',
  '👍': '<i class="ph ph-thumbs-up"></i>',
  '⚠️': '<i class="ph ph-warning-circle"></i>',
  '🗑': '<i class="ph ph-trash"></i>',
  '👤': '<i class="ph ph-user"></i>',
  '👥': '<i class="ph ph-users"></i>',
  '💬': '<i class="ph ph-chat-text"></i>',
  '🤖': '<i class="ph ph-robot"></i>',
  '👑': '<i class="ph ph-crown"></i>',
  '📉': '<i class="ph ph-trend-down"></i>',
  '🎯': '<i class="ph ph-crosshair"></i>',
  '🚀': '<i class="ph ph-rocket"></i>',
  '🧠': '<i class="ph ph-brain"></i>',
  '🏆': '<i class="ph ph-trophy"></i>',
  '📚': '<i class="ph ph-books"></i>',
  '🧘': '<i class="ph ph-yoga"></i>',
  '📱': '<i class="ph ph-device-mobile"></i>',
  '💚': '<i class="ph ph-heart"></i>',
  '🔴': '<i class="ph ph-circle"></i>',
  '💼': '<i class="ph ph-briefcase"></i>',
  '💻': '<i class="ph ph-laptop"></i>',
  '🏢': '<i class="ph ph-buildings"></i>',
  '🎁': '<i class="ph ph-gift"></i>',
  '🛒': '<i class="ph ph-shopping-cart"></i>',
  '💡': '<i class="ph ph-lightbulb"></i>',
  '🚿': '<i class="ph ph-shower"></i>',
  '📶': '<i class="ph ph-wifi-high"></i>',
  '🔥': '<i class="ph ph-fire"></i>',
  '🚌': '<i class="ph ph-bus"></i>',
  '🏥': '<i class="ph ph-hospital"></i>',
  '🍽️': '<i class="ph ph-fork-knife"></i>',
  '🎬': '<i class="ph ph-film-slate"></i>',
  '👗': '<i class="ph ph-dress"></i>',
  '💪': '<i class="ph ph-barbell"></i>',
  '✈️': '<i class="ph ph-airplane"></i>',
  '🎀': '<i class="ph ph-ribbon"></i>',
  '💅': '<i class="ph ph-nail-polish"></i>',
  '☕': '<i class="ph ph-coffee"></i>',
  '🤝': '<i class="ph ph-handshake"></i>',
  '🐾': '<i class="ph ph-paw-print"></i>',
  '💜': '<i class="ph ph-heart"></i>',
  '💵': '<i class="ph ph-money"></i>',
  '🥇': '<i class="ph ph-medal"></i>',
  '🥈': '<i class="ph ph-medal"></i>',
  '🥉': '<i class="ph ph-medal"></i>',
  '👁': '<i class="ph ph-eye"></i>',
  '🙈': '<i class="ph ph-eye-slash"></i>',
  '📅': '<i class="ph ph-calendar"></i>',
  '📝': '<i class="ph ph-note-pencil"></i>',
  '🔔': '<i class="ph ph-bell"></i>',
  '🏷️': '<i class="ph ph-tag"></i>',
  '🔗': '<i class="ph ph-link"></i>',
  '⭐': '<i class="ph ph-star"></i>',
  '✏️': '<i class="ph ph-pencil"></i>',
  '🖼️': '<i class="ph ph-image"></i>',
  '📎': '<i class="ph ph-paperclip"></i>',
  '🔍': '<i class="ph ph-magnifying-glass"></i>',
  '📥': '<i class="ph ph-download-simple"></i>',
};

const PHOSPHOR_CDN = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@phosphor-icons/core@2.1.1/css/phosphor-icons.min.css">';

const files = [
  'C:/Users/Inmov/Downloads/financeos-app/js/constants.js',
  'C:/Users/Inmov/Downloads/financeos-app/js/voice.js',
  'C:/Users/Inmov/Downloads/financeos-app/js/user-app.js',
  'C:/Users/Inmov/Downloads/financeos-app/js/agent-app.js',
  'C:/Users/Inmov/Downloads/financeos-app/js/admin-app.js',
  'C:/Users/Inmov/Downloads/financeos-app/js/broker-app.js',
];

for (const fp of files) {
  let content = readFileSync(fp, 'utf-8');
  let count = 0;
  for (const [emoji, replacement] of Object.entries(EMOJI_MAP)) {
    const regex = new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const newContent = content.replace(regex, replacement);
    if (newContent !== content) {
      count += (content.match(regex) || []).length;
      content = newContent;
    }
  }
  if (count > 0) {
    writeFileSync(fp, content, 'utf-8');
    console.log(`✅ ${fp.split('/').pop()}: ${count} icons replaced`);
  } else {
    console.log(`⏭️  ${fp.split('/').pop()}: no changes`);
  }
}
