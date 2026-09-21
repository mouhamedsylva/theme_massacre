/**
 * conf-text-svg-utils.js - Utilitaires pour génération SVG côté serveur
 * 
 * Extraction des métadonnées de texte du DOM pour envoi à l'API SVG backend.
 * Fallback et gestion d'erreurs pour rasterisation texte haute résolution.
 */
(function () {
  'use strict';

  /** Flag global activant la génération SVG serveur (défini dans le template Shopify). */
  window.TEXT_SVG_ENABLED = window.TEXT_SVG_ENABLED || false;

  /**
   * Extrait les métadonnées de texte d'un élément .design-text pour l'API SVG.
   * Convertit les styles DOM calculés en structure JSON attendue par le backend.
   * 
   * @param {HTMLElement} el - Élément .design-text
   * @returns {Object} Métadonnées pour API /uploads/text-svg
   */
  function extractTextMetadataForSvg(el) {
    if (!el) return null;

    var content = el.querySelector('.dt-content');
    if (!content) return null;

    var rawText = (content.textContent || '').trim();
    if (!rawText) return null;

    var cs = window.getComputedStyle(el);
    var defaultColor = cs.color || '#000000';
    var defaultFontFamily = cs.fontFamily || 'sans-serif';
    var defaultWeight = cs.fontWeight || '400';
    var defaultStyle = cs.fontStyle === 'italic' ? 'italic' : 'normal';
    var defaultDecoration = cs.textDecorationLine || cs.textDecoration || '';
    var defaultUnderline = defaultDecoration.indexOf('underline') !== -1;

    // Extraction des segments avec styles individuels
    var segments = [];
    var segmentNodes = content.querySelectorAll('.dt-seg');

    if (segmentNodes.length > 0) {
      // Texte avec mise en forme par caractère
      for (var i = 0; i < segmentNodes.length; i++) {
        var node = segmentNodes[i];
        var nodeText = node.textContent || '';
        if (!nodeText) continue;

        var nodeCs = window.getComputedStyle(node);
        var nodeDecoration = nodeCs.textDecorationLine || nodeCs.textDecoration || '';
        
        segments.push({
          text: nodeText,
          fontFamily: cleanFontFamily(nodeCs.fontFamily || defaultFontFamily),
          fontSize: parseFloat(nodeCs.fontSize) || 16,
          fontWeight: normalizeFontWeight(nodeCs.fontWeight || defaultWeight),
          fontStyle: nodeCs.fontStyle === 'italic' ? 'italic' : 'normal',
          color: nodeCs.color || defaultColor,
          underline: nodeDecoration.indexOf('underline') !== -1
        });
      }
    } else {
      // Texte simple sans segments
      segments.push({
        text: rawText,
        fontFamily: cleanFontFamily(defaultFontFamily),
        fontSize: parseFloat(cs.fontSize) || 16,
        fontWeight: normalizeFontWeight(defaultWeight),
        fontStyle: defaultStyle,
        color: defaultColor,
        underline: defaultUnderline
      });
    }

    // Métadonnées contextuelles
    var zoneId = (el.id || '').replace(/^text-/, '');
    var productType = getCurrentProductType();
    var placement = mapZoneToPlacement(zoneId);

    return {
      segments: segments,
      productType: productType,
      placement: placement,
      renderOptions: {
        scale: 4, // 4x la résolution pour qualité maximale
        padding: 32,
        backgroundColor: 'transparent'
      },
      metadata: JSON.stringify({
        zoneId: zoneId,
        originalFontSize: parseFloat(cs.fontSize) || 16,
        extractedAt: new Date().toISOString()
      })
    };
  }

  /**
   * Nettoie et normalise le nom de famille de police pour SVG.
   */
  function cleanFontFamily(fontFamily) {
    if (!fontFamily) return 'sans-serif';
    
    // Retire les guillemets et normalise
    var cleaned = fontFamily
      .replace(/['"]/g, '')
      .split(',')[0] // Prend seulement la première police
      .trim();
    
    // Fallback si vide
    return cleaned || 'sans-serif';
  }

  /**
   * Normalise le poids de police pour SVG.
   */
  function normalizeFontWeight(weight) {
    if (!weight) return '400';
    
    // Conversion des noms vers valeurs numériques
    var weightMap = {
      'normal': '400',
      'bold': '700',
      'lighter': '300',
      'bolder': '600'
    };
    
    var lowerWeight = weight.toString().toLowerCase();
    if (weightMap[lowerWeight]) return weightMap[lowerWeight];
    
    // Déjà numérique ou inconnu
    return weight.toString();
  }

  /**
   * Détermine le type de produit actuel depuis le DOM.
   */
  function getCurrentProductType() {
    // Logique d'extraction basée sur votre configurateur
    var productIndicators = [
      { selector: '.coin-canvas-container', type: 'coin' },
      { selector: '.flag-canvas', type: 'flag' },
      { selector: '.patch-canvas', type: 'patch' },
      { selector: '[data-product*="sweatshirt"]', type: 'sweatshirt' },
      { selector: '[data-product*="tshirt"]', type: 'tshirt' }
    ];
    
    for (var i = 0; i < productIndicators.length; i++) {
      if (document.querySelector(productIndicators[i].selector)) {
        return productIndicators[i].type;
      }
    }
    
    return 'generic';
  }

  /**
   * Mappe un ID de zone vers un placement standardisé.
   */
  function mapZoneToPlacement(zoneId) {
    var placementMap = {
      'f': 'front',
      'b': 'back',
      'fr': 'chest-right', 
      'sl': 'sleeve-left',
      'sr': 'sleeve-right',
      'c': 'patch'
    };
    
    return placementMap[zoneId] || 'generic';
  }

  /**
   * Appel API pour génération SVG côté serveur.
   * 
   * @param {Object} textMetadata - Métadonnées extraites par extractTextMetadataForSvg()
   * @returns {Promise<string>} URL Cloudinary de l'asset généré
   */
  async function generateTextViaSvgApi(textMetadata) {
    try {
      var response = await fetch('/api/uploads/text-svg', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(textMetadata)
      });

      if (!response.ok) {
        var errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      var result = await response.json();
      
      if (!result.url) {
        throw new Error('Réponse API invalide: URL manquante');
      }

      console.log('Texte SVG généré:', result.url, 
                  `${result.width}x${result.height}`, 
                  `${Math.round(result.bytes / 1024)}KB`);
      
      return result.url;
      
    } catch (error) {
      console.error('Erreur génération SVG serveur:', error);
      throw error;
    }
  }

  /**
   * Détecte si l'API SVG serveur est disponible.
   * Test rapide sans génération d'asset.
   */
  async function testSvgApiAvailability() {
    try {
      var response = await fetch('/api/uploads/text-svg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: [{
            text: 'test',
            fontFamily: 'sans-serif', 
            fontSize: 16,
            fontWeight: '400',
            color: '#000000'
          }]
        })
      });
      
      // 400 = validation error (attendu), 404/500 = API indisponible
      return response.status === 400 || response.status === 200;
      
    } catch (error) {
      console.warn('API SVG serveur indisponible:', error.message);
      return false;
    }
  }

  /**
   * Cache pour éviter de tester l'API à chaque rasterisation.
   */
  var svgApiAvailableCache =
