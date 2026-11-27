# Nuisible Express 34 · application d'interventions

Application web installable (PWA) pour gérer les interventions 4D (dératisation, désinsectisation, désinfection, dépigeonnage), la nacelle et les travaux divers : planning, clients et sites, contrats annuels, suivi des postes sur plan, produits biocides et registre, rapports PDF signés, fiche délai de rentrée.

- Aucune compilation : fichiers statiques (Preact + htm, supabase-js, jsPDF, JSZip, copiés dans `js/vendor`).
- Données : Supabase (projet `qjspgpiyefrrfiavrrzu`, UE). La clé publique dans `js/config.js` est faite pour être visible ; les données sont protégées par les règles RLS de la base.
- Hébergement : GitHub Pages, à la racine du dépôt.
- Hors connexion : `sw.js` garde l'appli en cache ; les modifications et photos attendent le retour du réseau.

Le premier compte créé dans l'appli devient administrateur.
