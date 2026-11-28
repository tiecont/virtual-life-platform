using UnityEngine;
using UnityEngine.Playables;

namespace Aetheria.Icarus
{
    [RequireComponent(typeof(PlayableDirector))]
    public sealed class CharacterPerformancePreview : MonoBehaviour
    {
        public Camera shot;
        public Transform focus;
        PlayableDirector director;
        Vector3 authoredPosition;
        Quaternion authoredRotation;
        bool inspecting;

        void Awake() => director = GetComponent<PlayableDirector>();

        void Update()
        {
            if (!shot || !focus || !director.playableAsset) return;
            if (Input.GetKeyDown(KeyCode.Space))
            {
                if (director.state == PlayState.Playing) director.Pause();
                else
                {
                    RestoreShot();
                    director.Play();
                }
            }
            int step = (Input.GetKeyDown(KeyCode.RightArrow) ? 1 : 0)
                - (Input.GetKeyDown(KeyCode.LeftArrow) ? 1 : 0);
            if (step != 0)
            {
                director.Pause();
                RestoreShot();
                director.time = System.Math.Clamp(director.time + step / 60.0, 0, director.duration);
                director.Evaluate();
            }
            if (director.state == PlayState.Playing || !Input.GetMouseButton(1)) return;
            if (!inspecting)
            {
                authoredPosition = shot.transform.localPosition;
                authoredRotation = shot.transform.localRotation;
                inspecting = true;
            }
            shot.transform.RotateAround(focus.position, Vector3.up, Input.GetAxis("Mouse X") * 3f);
        }

        void OnDisable() => RestoreShot();

        void RestoreShot()
        {
            if (inspecting && shot)
                shot.transform.SetLocalPositionAndRotation(authoredPosition, authoredRotation);
            inspecting = false;
        }
    }
}
