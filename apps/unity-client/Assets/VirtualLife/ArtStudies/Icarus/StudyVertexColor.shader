Shader "Aetheria/StudyVertexColor"
{
    Properties { _StudySurface ("Study Surface", Float) = 0 }
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
            CBUFFER_START(UnityPerMaterial)
                float _StudySurface;
            CBUFFER_END
            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; half4 color : COLOR; float2 uv : TEXCOORD0; };
            struct Varyings { float4 positionCS : SV_POSITION; half3 normalWS : TEXCOORD0; half4 color : COLOR; float3 positionWS : TEXCOORD1; float2 uv : TEXCOORD2; };
            Varyings Vert(Attributes input)
            {
                Varyings output;
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.color = input.color;
                output.positionWS = TransformObjectToWorld(input.positionOS.xyz);
                output.uv = input.uv;
                return output;
            }
            half4 Frag(Varyings input, bool front : SV_IsFrontFace) : SV_Target
            {
                Light light = GetMainLight();
                half3 normal = normalize(input.normalWS) * (front ? 1 : -1);
                half diffuse = saturate(dot(normal, light.direction));
                half band = lerp(0.46, 0.80, smoothstep(0.18, 0.32, diffuse));
                band = lerp(band, 1.0, smoothstep(0.70, 0.85, diffuse));
                half3 view = GetWorldSpaceNormalizeViewDir(input.positionWS);
                half rim = pow(1-saturate(dot(normal, view)), 4) * 0.10;
                half gold = step(input.color.b * 2.2, input.color.r) * step(input.color.g * 1.1, input.color.r);
                half specular = pow(saturate(dot(normal, normalize(light.direction+view))), 36) * gold * 0.24;
                half3 baseColor = input.color.rgb;
                if (_StudySurface > 0.5 && _StudySurface < 1.5 && input.uv.x > 1.5)
                {
                    float across = frac(input.uv.x)-0.5;
                    float veins = sin((input.uv.y+abs(across)*0.18)*280);
                    float detail = 1-saturate(fwidth(input.uv.y)*100);
                    half shaft = 1-smoothstep(0.008, 0.025, abs(across));
                    baseColor *= 0.95+0.015*veins*detail+0.03*shaft;
                }
                if (_StudySurface < 0.5 && input.uv.x > 3.5 && input.uv.x < 5.5)
                {
                    float strand = cos(frac(input.uv.x)*72);
                    float detail = 1-saturate(fwidth(input.uv.x)*30);
                    baseColor *= 0.96+0.045*strand*detail;
                }
                // Facial color is authored independently of the costume's hard cel bands.
                if (_StudySurface < 0.5 && input.uv.x > 5.5 && input.uv.x < 7.5)
                {
                    band = lerp(0.84, 1.0, smoothstep(-0.25, 0.8, dot(normal, light.direction)));
                    rim *= 0.2;
                    specular = 0;
                }
                if (_StudySurface < 0.5 && input.uv.x > 7.5)
                {
                    band = 1;
                    rim = 0;
                    specular = 0;
                }
                return half4(baseColor * band * half3(1.0, 0.97, 1.03) + rim * half3(0.45, 0.35, 0.26) + specular, 1);
            }
            ENDHLSL
        }
    }
}
