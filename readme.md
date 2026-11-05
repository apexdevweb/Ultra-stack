### COPIER COLLER LA DIVE ET LE SCRIPT POUR OBTENIR LA SCENE
_____________________________________________________________
## ATTENTION IL FAUT METTRE LE BONS CHEMINS DU SCRIPT ET DU FICHIER JSON DANS LA DIV
--------------------------------------------------------------------------------------
|
|=====================>: `<div data-nuee="nuee-scene.json" style="width:100%;height:480px"></div>`<br>
|
|=====================>: `<script src="nuee-embed.js"></script>`
|
## ↓↓↓  Attributs facultatifs sur le <div> ↓↓↓
|
|====> data-nuee-transparent="true"   fond transparent (la page se voit derrière)<br>
|
|====> data-nuee-bg="#000000"         couleur de fond<br>
|
|====> data-nuee-density="60000"      nombre de particules (remplace celui de la scène)<br>
|
|====> data-nuee-drag="true"          rotation 3D au glisser (désactivée par défaut pour ne pas bloquer le défilement)<br>
|
|====> data-nuee-interactive="false"  arrête de calculer les distances à chaque micro-mouvement<br>


  // 1. Enregistrer une donnée dans la session
  sessionStorage.setItem("clef", "valeur");
  sessionStorage.setItem("username", "Alex");

  // 2. Récupérer une donnée de la session
  let user = sessionStorage.getItem("username");
  console.log(user); // Affiche "Alex"

  // 3. Supprimer une donnée spécifique
  sessionStorage.removeItem("username");

  // 4. Vider toutes les données de la session d'un coup
  sessionStorage.clear();


