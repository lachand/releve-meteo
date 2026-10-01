import { runWidget } from './run';

/*
 * Point d'entree de widget.html : charge sans interface par l'application
 * Android, qui lit le resultat par `ReleveAndroid.publish`. Dans un navigateur,
 * le resultat s'ecrit dans la page, pour l'essayer a la main.
 */

interface AndroidBridge {
  publish(json: string): void;
}

async function main(): Promise<void> {
  const bridge = (window as unknown as { ReleveAndroid?: AndroidBridge }).ReleveAndroid;
  try {
    const payload = await runWidget(window.location.search, new Date());
    const json = JSON.stringify(payload);
    if (bridge === undefined) {
      document.body.textContent = json;
    } else {
      bridge.publish(json);
    }
  } catch (error) {
    // Un echec n'est jamais un contenu vide : l'application garde le dernier bon resultat.
    const message = error instanceof Error ? error.message : String(error);
    if (bridge === undefined) {
      document.body.textContent = `echec : ${message}`;
    } else {
      (bridge as unknown as { fail(message: string): void }).fail(message);
    }
  }
}

void main();
