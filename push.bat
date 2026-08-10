@echo off
echo ============================================
echo   PUSH DU THEME SHOPIFY - Massacre Officiel
echo ============================================
echo.
echo Utilise --nodelete pour eviter les erreurs sur
echo les fichiers proteges (theme.liquid, gift_card, etc.)
echo.

shopify theme push --store 38cca3.myshopify.com --theme 201677537614 --nodelete

echo.
echo Push termine !
pause
