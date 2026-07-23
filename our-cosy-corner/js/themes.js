/*
 * themes.js — cosy theme presets + live customiser.
 * A theme is just a bag of CSS variables applied to <html>. It is stored on
 * the space (shared), so both partners see the same cosy world.
 */
(function () {
  'use strict';

  var PRESETS = {
    'parchment': {
      label: 'Parchment',
      vars: {
        '--bg': '#edede9', '--bg-2': '#e3d5ca', '--panel': '#faf6f2',
        '--panel-2': '#f5ebe0', '--ink': '#2e2823', '--ink-soft': '#5f5044',
        '--accent': '#7b4b33', '--accent-ink': '#faf6f2', '--accent-soft': '#d5bdaf',
        '--line': '#d6ccc2',
        '--font-head': "'IBM Plex Sans', system-ui, sans-serif", '--font-body': "'IBM Plex Sans', system-ui, sans-serif",
        '--radius': '12px', '--paper': '1'
      }
    },
    'peach-blossom': {
      label: 'Peach Blossom',
      vars: {
        '--bg': '#f8edeb', '--bg-2': '#fcd5ce', '--panel': '#fffaf9',
        '--panel-2': '#f9dcc4', '--ink': '#4a2b26', '--ink-soft': '#8a5f56',
        '--accent': '#b8543f', '--accent-ink': '#fffaf9', '--accent-soft': '#ffb5a7',
        '--line': '#f0dcd6',
        '--font-head': "'IBM Plex Sans', system-ui, sans-serif", '--font-body': "'IBM Plex Sans', system-ui, sans-serif",
        '--radius': '16px', '--paper': '1'
      }
    },
    'cherry-blossom': {
      label: 'Cherry Blossom',
      vars: {
        '--bg': '#ffe5ec', '--bg-2': '#ffcedb', '--panel': '#fff6f9',
        '--panel-2': '#ffe2ea', '--ink': '#56263a', '--ink-soft': '#8f5168',
        '--accent': '#c23a5e', '--accent-ink': '#ffffff', '--accent-soft': '#ffb3c6',
        '--line': '#f7c9d6',
        '--font-head': "'IBM Plex Sans', system-ui, sans-serif", '--font-body': "'IBM Plex Sans', system-ui, sans-serif",
        '--radius': '20px', '--paper': '0'
      }
    },
    'evergreen': {
      label: 'Evergreen',
      vars: {
        '--bg': '#cad2c5', '--bg-2': '#bfc9ba', '--panel': '#eef1ea',
        '--panel-2': '#dee5d9', '--ink': '#2f3e46', '--ink-soft': '#3f5a58',
        '--accent': '#52796f', '--accent-ink': '#ffffff', '--accent-soft': '#84a98c',
        '--line': '#b0bcab',
        '--font-head': "'IBM Plex Sans', system-ui, sans-serif", '--font-body': "'IBM Plex Sans', system-ui, sans-serif",
        '--radius': '14px', '--paper': '0'
      }
    },
    'frosted-petal': {
      label: 'Frosted Petal',
      vars: {
        '--bg': '#eff7f6', '--bg-2': '#d9f5f1', '--panel': '#fbfdfd',
        // --ink-soft darkened from #5b837e: it carries the 10.5px uppercase
        // labels (sidebar zone heads, block type tags), which measured 4.12:1
        // against --panel here — under AA for small text. This clears 4.5:1.
        '--panel-2': '#fbeef3', '--ink': '#1f4e4a', '--ink-soft': '#517671',
        '--accent': '#c74277', '--accent-ink': '#ffffff', '--accent-soft': '#f2b5d4',
        '--line': '#d5e8e5',
        '--font-head': "'IBM Plex Sans', system-ui, sans-serif", '--font-body': "'IBM Plex Sans', system-ui, sans-serif",
        '--radius': '20px', '--paper': '0'
      }
    },
    'clear-harbour': {
      label: 'Clear Harbour',
      vars: {
        '--bg': '#e6f3fc', '--bg-2': '#d9f0ef', '--panel': '#f7fbff',
        '--panel-2': '#e4f1fa', '--ink': '#1b4965', '--ink-soft': '#52768e',
        '--accent': '#1b4965', '--accent-ink': '#f2f9ff', '--accent-soft': '#bee9e8',
        '--line': '#c9dfec',
        '--font-head': "'IBM Plex Sans', system-ui, sans-serif", '--font-body': "'IBM Plex Sans', system-ui, sans-serif",
        '--radius': '16px', '--paper': '0'
      }
    },
    'velvet-night': {
      label: 'Velvet Night',
      vars: {
        '--bg': '#11001c', '--bg-2': '#1d0126', '--panel': '#3d0136',
        '--panel-2': '#4f0147', '--ink': '#f2e7fb', '--ink-soft': '#c3a8d8',
        '--accent': '#a35de0', '--accent-ink': '#1c0129', '--accent-soft': '#3a015c',
        '--line': '#43155c',
        '--font-head': "'IBM Plex Sans', system-ui, sans-serif", '--font-body': "'IBM Plex Sans', system-ui, sans-serif",
        '--radius': '18px', '--paper': '0'
      }
    }
  };

  function applyVars(vars) {
    var root = document.documentElement;
    Object.keys(vars).forEach(function (k) { root.style.setProperty(k, vars[k]); });
    // paper texture toggle
    document.body.classList.toggle('has-paper', vars['--paper'] === '1');
  }

  // theme = { preset: 'parchment', custom: { accent, bg, font, radius } }
  function apply(theme) {
    theme = theme || { preset: 'parchment' };
    var base = PRESETS[theme.preset] || PRESETS['parchment'];
    var vars = Object.assign({}, base.vars);
    if (theme.custom) {
      if (theme.custom.accent) vars['--accent'] = theme.custom.accent;
      if (theme.custom.bg) { vars['--bg'] = theme.custom.bg; vars['--bg-2'] = theme.custom.bg; }
      if (theme.custom.font) { vars['--font-body'] = theme.custom.font; vars['--font-head'] = theme.custom.font; }
      if (theme.custom.radius != null) vars['--radius'] = theme.custom.radius + 'px';
    }
    applyVars(vars);
    document.documentElement.setAttribute('data-theme', theme.preset || 'parchment');
  }

  window.CosyThemes = { PRESETS: PRESETS, apply: apply };
})();
