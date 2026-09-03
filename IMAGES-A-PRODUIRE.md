# Images textiles — état actuel

Les images de `IMAGES/` ont été renommées à la convention du thème et
installées dans `assets/`. Ce document dit **ce qui est en place** et **ce
qu'il reste à fournir**.

---

## Couverture

| Produit | Couleurs | Complètes | À compléter |
|---------|----------|-----------|-------------|
| Sweatshirt | 30 | 28 | 2 |
| T-shirt coton | 32 | 32 | 0 |
| T-shirt polyester | 17 | 17 | 0 |

## Ce qu'il reste à fournir

**2 couleur(s)**, soit **2 fichier(s)**.

| Produit | N° | Nom | Teinte | Vue(s) manquante(s) |
|---------|----|-----|--------|---------------------|
| Sweatshirt | 229 | Taupe rosé | `#e0cbc0` | `sweatshirt-taupe-rose-face.png` |
| Sweatshirt | 172 | Caramel | `#bc7a2c` | `sweatshirt-caramel-face.png` |

Format : **PNG 500 × 500**, fond transparent, à déposer dans `assets/`.
Aucune modification de code n'est nécessaire — le nom du fichier suffit.

---

## Variants Shopify — toujours à créer

**Sans variant correspondant, la commande part sur une couleur fausse.** Le
prix reste juste, mais la confirmation et la facture affichent une autre
teinte. C'est le dernier point bloquant pour la mise en production.

Sur chaque produit, remplacer les valeurs de l'option « Couleur » par ces
listes — **à l'identique**, accents compris.

#### Sweatshirt (30)

```
Blanc / Transparent, Blanc rosé, Blanc cassé, Camel, Taupe, Taupe rosé,
Jaune vif, Caramel, Orange vif, Rouge cerise, Corail, Mauve foncé, Prune,
Bordeaux, Rose fuchsia, Rose pâle, Bleu ciel, Bleu azur, Bleu marine,
Bleu gris, Gris ardoise, Gris bleuté, Gris clair, Gris perle,
Gris anthracite, Vert amande, Vert sapin, Vert kaki, Kaki foncé, Noir
```

#### T-shirt coton (32)

```
Blanc, Camel, Rose taupe, Vert olive, Marron chocolat, Jaune vif,
Orange vif, Rouge écarlate, Bordeaux, Rose fuchsia, Rose pâle,
Violet aubergine, Mauve orchidée, Bleu roi, Bleu ciel pâle,
Bleu turquoise, Bleu cyan, Bleu ardoise, Bleu marine foncé, Jaune citron,
Vert anis clair, Vert pomme, Vert prairie, Vert émeraude, Vert sapin,
Kaki doré, Kaki foncé, Gris clair, Gris perle, Gris ardoise foncé,
Vert militaire, Noir
```

#### T-shirt polyester (17)

```
Blanc, Beige taupe, Jaune vif, Jaune citron, Orange vif, Corail,
Rouge écarlate, Rose fuchsia, Violet indigo, Bleu roi, Bleu turquoise,
Bleu marine foncé, Vert émeraude, Vert anis, Kaki doré, Vert militaire,
Noir
```

Les identifiants se collent dans `sections/recapitulatif.liquid`, table
`CONF_COLOR_VARIANTS` (et `CONF_SLEEVE_COLOR_VARIANTS` pour le supplément
manches). L'identifiant se lit dans l'URL du variant :
`…/variants/60327512342862`. Transmettez-les moi, je les intègre.

---

## Notes

### Nettoyage

**72 images** sans correspondance avec les palettes ont été sorties de
`assets/` vers `../Images-textiles-retirees/` — hors du thème, donc non
déployées, mais récupérables.

Elles servaient de repli aux articles **déjà dans un panier** portant les
anciens noms anglais (Sand, Navy, Apricot…). Ces lignes afficheront désormais
le vêtement générique ; prix, taille et design restent justes.

### Le dossier source

`IMAGES/` n'a pas été modifié. Il contient encore 3 fichiers `tshirt-*` dans
`sweatshirt/vue face` — des doublons du coton, non importés.
