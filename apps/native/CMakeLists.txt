project(codec_native_app LANGUAGES CXX)

find_package(OpenCV REQUIRED)

add_executable(codec_app main.cpp CodecExplorerApp.cpp CvAdapter.cpp)

target_link_libraries(codec_app 
    PRIVATE 
        codec_core 
        ${OpenCV_LIBS}
)

# Ensure it can find OpenCV headers
target_include_directories(codec_app PRIVATE ${OpenCV_INCLUDE_DIRS})