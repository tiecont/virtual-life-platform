Shader "Aetheria/StudyVertexColor"
{
    SubShader
    {
        Tags { "RenderType"="Opaque" "RenderPipeline"="UniversalPipeline" }
        Pass
        {
            Tags { "LightMode"="UniversalForward" }
            Cull Off
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; half4 color : COLOR; };
            struct Varyings { float4 positionCS : SV_POSITION; half3 normalWS : TEXCOORD0; half4 color : COLOR; };
            Varyings Vert(Attributes input)
            {
                Varyings output;
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.color = input.color;
                return output;
            }
            half4 Frag(Varyings input, bool front : SV_IsFrontFace) : SV_Target
            {
                Light light = GetMainLight();
                half3 normal = normalize(input.normalWS) * (front ? 1 : -1);
                half diffuse = saturate(dot(normal, light.direction));
                half band = lerp(0.62, 1.0, smoothstep(0.1, 0.2, diffuse));
                return half4(input.color.rgb * band * (0.75 + light.color * 0.25), 1);
            }
            ENDHLSL
        }
    }
}
